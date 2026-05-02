import { execSync, exec } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { db, sessionsTable, agentFilesTable, agentEventsTable, testResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

const execAsync = promisify(exec);

const WORKSPACES_DIR = "/tmp/agent-workspaces";

export function getWorkspacePath(sessionId: number): string {
  return join(WORKSPACES_DIR, `session-${sessionId}`);
}

async function addEvent(sessionId: number, type: string, content: string, iteration: number) {
  await db.insert(agentEventsTable).values({ sessionId, type, content, iteration });
}

async function updateStatus(sessionId: number, status: string) {
  await db.update(sessionsTable).set({ status, updatedAt: new Date() }).where(eq(sessionsTable.id, sessionId));
}

async function saveFiles(sessionId: number, files: { name: string; content: string; language: string }[]) {
  for (const file of files) {
    const existing = await db.select().from(agentFilesTable)
      .where(eq(agentFilesTable.sessionId, sessionId));
    const match = existing.find(f => f.name === file.name);
    if (match) {
      await db.update(agentFilesTable).set({ content: file.content, language: file.language, updatedAt: new Date() })
        .where(eq(agentFilesTable.id, match.id));
    } else {
      await db.insert(agentFilesTable).values({ sessionId, ...file });
    }
    const workspacePath = getWorkspacePath(sessionId);
    const filePath = join(workspacePath, file.name);
    mkdirSync(filePath.substring(0, filePath.lastIndexOf("/")), { recursive: true });
    writeFileSync(filePath, file.content, "utf-8");
  }
}

function detectLanguage(filename: string): string {
  if (filename.endsWith(".py")) return "python";
  if (filename.endsWith(".ts")) return "typescript";
  if (filename.endsWith(".js")) return "javascript";
  if (filename.endsWith(".json")) return "json";
  if (filename.endsWith(".md")) return "markdown";
  if (filename.endsWith(".sh")) return "bash";
  return "text";
}

async function runTests(workspacePath: string, language: string): Promise<{ passed: boolean; output: string; errors: string | null }> {
  let cmd = "";
  if (language === "python") {
    cmd = `cd "${workspacePath}" && timeout 30 python -m pytest -v --tb=short 2>&1 || true`;
    if (!existsSync(join(workspacePath, "test_*.py")) && !existsSync(join(workspacePath, "*_test.py"))) {
      cmd = `cd "${workspacePath}" && timeout 30 python -c "import subprocess, sys; result = subprocess.run(['python', 'main.py'], capture_output=True, text=True, timeout=25); print(result.stdout); print(result.stderr); sys.exit(result.returncode)" 2>&1 || true`;
    }
  } else if (language === "typescript") {
    cmd = `cd "${workspacePath}" && timeout 30 npx ts-node --version > /dev/null 2>&1 && timeout 30 npx ts-node main.ts 2>&1 || true`;
  } else {
    cmd = `cd "${workspacePath}" && timeout 30 node main.js 2>&1 || true`;
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 35000 });
    const output = stdout + stderr;
    const passed = !output.toLowerCase().includes("error") && !output.toLowerCase().includes("failed") && !output.toLowerCase().includes("exception");
    return { passed, output: output.slice(0, 5000), errors: passed ? null : output.slice(0, 2000) };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = (error.stdout || "") + (error.stderr || error.message || "");
    return { passed: false, output: output.slice(0, 5000), errors: output.slice(0, 2000) };
  }
}

async function initGit(workspacePath: string, sessionId: number) {
  try {
    execSync(`cd "${workspacePath}" && git init && git config user.email "agent@forge.dev" && git config user.name "Forge Agent"`, { stdio: "ignore" });
    await db.update(sessionsTable).set({ gitInitialized: "true" }).where(eq(sessionsTable.id, sessionId));
    await addEvent(sessionId, "git", "Initialized git repository", 0);
  } catch {
    logger.warn({ sessionId }, "Failed to init git");
  }
}

async function gitCommitAll(workspacePath: string, message: string) {
  try {
    execSync(`cd "${workspacePath}" && git add -A && git commit -m "${message.replace(/"/g, "'")}" 2>&1 || true`, { stdio: "ignore" });
  } catch {
    // ignore git errors
  }
}

function parseFilesFromResponse(response: string, language: string): { name: string; content: string; language: string }[] {
  const files: { name: string; content: string; language: string }[] = [];
  
  // Look for markdown code blocks with filenames
  const fileBlockRegex = /(?:###?\s+(?:File:\s*)?)?[`]{3}(\w+)?\s*(?:\/\/\s*([^\n]+))?\n([\s\S]*?)[`]{3}/g;
  const filenameCommentRegex = /^(?:#|\/\/)\s*(?:filename:|file:)?\s*(\S+\.\w+)/im;
  
  let match;
  let fileIndex = 0;
  
  while ((match = fileBlockRegex.exec(response)) !== null) {
    const lang = match[1] || language;
    const inlineComment = match[2];
    const content = match[3].trim();
    
    if (!content) continue;
    
    let filename = inlineComment;
    if (!filename) {
      const commentMatch = content.match(filenameCommentRegex);
      if (commentMatch) {
        filename = commentMatch[1];
      }
    }
    
    if (!filename) {
      const ext = language === "python" ? ".py" : language === "typescript" ? ".ts" : ".js";
      filename = fileIndex === 0 ? `main${ext}` : `file${fileIndex}${ext}`;
      if (lang === "json") filename = fileIndex === 0 ? "requirements.txt" : `config${fileIndex}.json`;
    }
    
    files.push({ name: filename, content, language: detectLanguage(filename) });
    fileIndex++;
  }
  
  if (files.length === 0) {
    const ext = language === "python" ? ".py" : language === "typescript" ? ".ts" : ".js";
    files.push({ name: `main${ext}`, content: response.trim(), language });
  }
  
  return files;
}

export async function runAgent(sessionId: number) {
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) return;

  const workspacePath = getWorkspacePath(sessionId);
  mkdirSync(workspacePath, { recursive: true });
  
  await db.update(sessionsTable).set({ workspacePath }).where(eq(sessionsTable.id, sessionId));
  await initGit(workspacePath, sessionId);

  const MAX_ITERATIONS = 5;
  let iteration = 0;
  let lastTestOutput = "";

  try {
    // Phase 1: Planning
    await updateStatus(sessionId, "planning");
    await addEvent(sessionId, "thought", `Starting to analyze task: "${session.task}"`, 0);

    const planResponse = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `You are an expert ${session.language} developer and planner. Given a coding task, create a concise execution plan with 3-5 steps. Be specific about what files you'll create and what each does. Keep the plan brief and actionable.`,
        },
        { role: "user", content: `Task: ${session.task}\n\nCreate an execution plan.` },
      ],
    });

    const plan = planResponse.choices[0]?.message?.content || "No plan generated";
    await addEvent(sessionId, "plan", plan, 0);

    // Phase 2: Code generation loop
    await updateStatus(sessionId, "coding");

    const systemPrompt = `You are an expert ${session.language} developer. Generate clean, well-tested, production-quality code.

Rules:
- Each file must start with a comment: # filename: <name> (for Python) or // filename: <name> (for JS/TS)
- Wrap each file in a markdown code block with the language tag
- Generate complete, runnable code — no placeholders or TODOs
- Include a main entry point (main.py / main.js / main.ts)
- If the task mentions tests, include test files (test_main.py for Python)
- Make the code actually run and produce correct output`;

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      
      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: iteration === 1
            ? `Task: ${session.task}\n\nPlan:\n${plan}\n\nGenerate all the ${session.language} files needed. Start each file block with a comment showing the filename.`
            : `Task: ${session.task}\n\nPrevious code had issues:\n${lastTestOutput}\n\nFix the errors and regenerate all files. Make sure the code runs correctly.`,
        },
      ];

      const codeResponse = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 4096,
        messages,
      });

      const codeContent = codeResponse.choices[0]?.message?.content || "";
      await addEvent(sessionId, "code", `Generated code (iteration ${iteration}):\n\n${codeContent.slice(0, 1000)}...`, iteration);

      const files = parseFilesFromResponse(codeContent, session.language);
      await saveFiles(sessionId, files);
      
      await gitCommitAll(workspacePath, `feat: generated code iteration ${iteration}`);
      await addEvent(sessionId, "git", `Committed iteration ${iteration} files to git`, iteration);

      // Phase 3: Test
      await updateStatus(sessionId, iteration === 1 ? "testing" : "iterating");
      await addEvent(sessionId, "test", `Running tests for iteration ${iteration}...`, iteration);

      const testResult = await runTests(workspacePath, session.language);
      await db.insert(testResultsTable).values({
        sessionId,
        passed: testResult.passed,
        output: testResult.output,
        errors: testResult.errors ?? null,
        iteration,
      });

      if (testResult.passed) {
        await addEvent(sessionId, "success", `All tests passed on iteration ${iteration}! ✓\n\n${testResult.output.slice(0, 500)}`, iteration);
        await gitCommitAll(workspacePath, `chore: tests passing - iteration ${iteration}`);
        await updateStatus(sessionId, "done");
        await db.update(sessionsTable).set({ iterations: iteration }).where(eq(sessionsTable.id, sessionId));
        return;
      } else {
        lastTestOutput = testResult.errors || testResult.output;
        await addEvent(sessionId, "error", `Tests failed on iteration ${iteration}:\n${testResult.errors?.slice(0, 800) || testResult.output.slice(0, 800)}`, iteration);
        
        if (iteration < MAX_ITERATIONS) {
          await addEvent(sessionId, "thought", `Analyzing errors and preparing fix for iteration ${iteration + 1}...`, iteration);
        }
      }
    }

    // Max iterations reached
    await addEvent(sessionId, "error", `Reached maximum iterations (${MAX_ITERATIONS}) without passing tests. Marking as failed.`, iteration);
    await db.update(sessionsTable).set({ status: "failed", iterations: iteration }).where(eq(sessionsTable.id, sessionId));

  } catch (err) {
    logger.error({ err, sessionId }, "Agent engine error");
    await addEvent(sessionId, "error", `Agent encountered an unexpected error: ${err instanceof Error ? err.message : String(err)}`, iteration);
    await updateStatus(sessionId, "failed");
  }
}
