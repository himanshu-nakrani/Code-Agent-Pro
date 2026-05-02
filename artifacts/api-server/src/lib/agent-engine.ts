import { execSync, exec } from "child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
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
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (dir) mkdirSync(dir, { recursive: true });
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
  if (filename.endsWith(".txt")) return "text";
  return "text";
}

async function installDependencies(workspacePath: string, language: string, sessionId: number): Promise<void> {
  try {
    if (language === "python") {
      const reqFile = join(workspacePath, "requirements.txt");
      if (existsSync(reqFile)) {
        await addEvent(sessionId, "thought", "Installing Python dependencies from requirements.txt...", 0);
        const { stdout, stderr } = await execAsync(
          `pip install -r "${reqFile}" --quiet --no-warn-script-location 2>&1`,
          { timeout: 60000 }
        );
        const out = (stdout + stderr).trim();
        if (out) await addEvent(sessionId, "thought", `Dependency install output:\n${out.slice(0, 500)}`, 0);
      } else {
        // Detect imports from python files and install common packages
        const pyFiles = execSync(`find "${workspacePath}" -name "*.py" 2>/dev/null`, { encoding: "utf-8" })
          .split("\n").filter(Boolean);
        const imports = new Set<string>();
        for (const f of pyFiles) {
          try {
            const content = readFileSync(f, "utf-8");
            const matches = content.matchAll(/^(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm);
            for (const m of matches) {
              const pkg = m[1];
              // Only attempt to install known third-party packages
              const thirdParty = ["numpy", "pandas", "requests", "flask", "fastapi", "scipy", "matplotlib",
                "sklearn", "tensorflow", "torch", "pytest", "httpx", "pydantic", "sqlalchemy",
                "aiohttp", "click", "rich", "typer", "pillow", "cv2", "bs4", "lxml"];
              if (thirdParty.includes(pkg)) imports.add(pkg === "cv2" ? "opencv-python" : pkg === "bs4" ? "beautifulsoup4" : pkg);
            }
          } catch { /* skip */ }
        }
        if (imports.size > 0) {
          const pkgList = [...imports].join(" ");
          await addEvent(sessionId, "thought", `Installing detected Python packages: ${pkgList}`, 0);
          await execAsync(`pip install ${pkgList} --quiet --no-warn-script-location 2>&1`, { timeout: 60000 });
        }
      }
    } else if (language === "javascript" || language === "typescript") {
      const pkgFile = join(workspacePath, "package.json");
      if (existsSync(pkgFile)) {
        await addEvent(sessionId, "thought", "Installing Node.js dependencies from package.json...", 0);
        const { stdout, stderr } = await execAsync(
          `cd "${workspacePath}" && npm install --silent 2>&1`,
          { timeout: 90000 }
        );
        const out = (stdout + stderr).trim();
        if (out) await addEvent(sessionId, "thought", `npm install output:\n${out.slice(0, 500)}`, 0);
      }
    }
  } catch (err) {
    logger.warn({ err, sessionId }, "Dependency installation warning (non-fatal)");
    await addEvent(sessionId, "thought", `Dependency install warning: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`, 0);
  }
}

async function runTests(workspacePath: string, language: string): Promise<{ passed: boolean; output: string; errors: string | null }> {
  let cmd = "";

  if (language === "python") {
    // Check for pytest test files
    const hasTestFiles = (() => {
      try {
        const out = execSync(`find "${workspacePath}" -name "test_*.py" -o -name "*_test.py" 2>/dev/null`, { encoding: "utf-8" }).trim();
        return out.length > 0;
      } catch { return false; }
    })();

    if (hasTestFiles) {
      cmd = `cd "${workspacePath}" && timeout 30 python -m pytest -v --tb=short 2>&1 || true`;
    } else {
      cmd = `cd "${workspacePath}" && timeout 30 python main.py 2>&1 || true`;
    }
  } else if (language === "typescript") {
    const hasPkg = existsSync(join(workspacePath, "package.json"));
    if (hasPkg) {
      const pkg = JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf-8"));
      if (pkg.scripts?.test) {
        cmd = `cd "${workspacePath}" && timeout 30 npm test 2>&1 || true`;
      } else {
        cmd = `cd "${workspacePath}" && timeout 30 npx ts-node main.ts 2>&1 || true`;
      }
    } else {
      cmd = `cd "${workspacePath}" && timeout 30 npx ts-node main.ts 2>&1 || true`;
    }
  } else {
    const hasPkg = existsSync(join(workspacePath, "package.json"));
    if (hasPkg) {
      const pkg = JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf-8"));
      if (pkg.scripts?.test) {
        cmd = `cd "${workspacePath}" && timeout 30 npm test 2>&1 || true`;
      } else {
        cmd = `cd "${workspacePath}" && timeout 30 node main.js 2>&1 || true`;
      }
    } else {
      cmd = `cd "${workspacePath}" && timeout 30 node main.js 2>&1 || true`;
    }
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 35000 });
    const output = (stdout + stderr).trim();
    const lower = output.toLowerCase();
    const passed = !lower.includes("error") && !lower.includes("failed") && !lower.includes("exception") && !lower.includes("traceback");
    return { passed, output: output.slice(0, 5000), errors: passed ? null : output.slice(0, 2000) };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = ((error.stdout || "") + (error.stderr || error.message || "")).trim();
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
  const fileBlockRegex = /(?:###?\s+(?:File:\s*)?`?([^`\n]+)`?\s*\n)?[`]{3}(\w+)?\s*(?:\/\/\s*([^\n]+))?\n([\s\S]*?)[`]{3}/g;
  const filenameCommentRegex = /^(?:#|\/\/)\s*(?:filename:|file:)?\s*(\S+\.\w+)/im;

  let match;
  let fileIndex = 0;

  while ((match = fileBlockRegex.exec(response)) !== null) {
    const headerFilename = match[1]?.trim();
    const lang = match[2] || language;
    const inlineComment = match[3];
    const content = match[4].trim();

    if (!content || content.length < 5) continue;

    let filename = headerFilename || inlineComment;
    if (!filename) {
      const commentMatch = content.match(filenameCommentRegex);
      if (commentMatch) {
        filename = commentMatch[1];
      }
    }

    if (!filename) {
      const ext = language === "python" ? ".py" : language === "typescript" ? ".ts" : ".js";
      filename = fileIndex === 0 ? `main${ext}` : `module${fileIndex}${ext}`;
      if (lang === "text" || lang === "txt") filename = "requirements.txt";
      if (lang === "json") filename = `config${fileIndex}.json`;
      if (lang === "sh" || lang === "bash") filename = `run${fileIndex}.sh`;
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

export async function resetAndRerunAgent(sessionId: number) {
  // Clear previous data
  await db.delete(agentEventsTable).where(eq(agentEventsTable.sessionId, sessionId));
  await db.delete(agentFilesTable).where(eq(agentFilesTable.sessionId, sessionId));
  await db.delete(testResultsTable).where(eq(testResultsTable.sessionId, sessionId));
  await db.update(sessionsTable).set({
    status: "pending",
    iterations: 0,
    gitInitialized: "false",
    updatedAt: new Date(),
  }).where(eq(sessionsTable.id, sessionId));

  // Clear workspace
  try {
    const wp = getWorkspacePath(sessionId);
    execSync(`rm -rf "${wp}"`, { stdio: "ignore" });
  } catch { /* ignore */ }

  return runAgent(sessionId);
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
      model: "gpt-4.1",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `You are an expert ${session.language} developer and planner. Given a coding task, create a concise execution plan with 3-5 steps. Be specific about what files you'll create and what each does. Keep the plan brief and actionable.`,
        },
        { role: "user", content: `Task: ${session.task}\n\nCreate an execution plan. List files you'll create and the purpose of each.` },
      ],
    });

    const plan = planResponse.choices[0]?.message?.content || "No plan generated";
    await addEvent(sessionId, "plan", plan, 0);

    // Phase 2: Code generation loop
    await updateStatus(sessionId, "coding");

    const systemPrompt = `You are an expert ${session.language} developer. Generate clean, well-tested, production-quality code.

Rules:
- Each file must start with a comment: # filename: <name> (for Python) or // filename: <name> (for JS/TS)
- Wrap each file in a markdown code block: \`\`\`python\\n# filename: main.py\\n...code...\`\`\`
- Generate complete, runnable code — no placeholders or TODOs
- Include a main entry point (main.py / main.js / main.ts)
- For Python: if you use third-party packages, include a requirements.txt file
- For JS/TS: if you use packages, include a package.json with dependencies
- If the task doesn't mention tests specifically, make the code produce visible output (print/console.log results)
- Make the code actually run and produce correct output`;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: iteration === 1
            ? `Task: ${session.task}\n\nPlan:\n${plan}\n\nGenerate all the ${session.language} files needed. Each file block must start with a filename comment.`
            : `Task: ${session.task}\n\nPrevious code had issues:\n${lastTestOutput}\n\nFix the errors and regenerate all files. Ensure the code runs without errors.`,
        },
      ];

      const codeResponse = await openai.chat.completions.create({
        model: "gpt-4.1",
        max_completion_tokens: 4096,
        messages,
      });

      const codeContent = codeResponse.choices[0]?.message?.content || "";
      await addEvent(sessionId, "code", `Generated code (iteration ${iteration}):\n\n${codeContent.slice(0, 1200)}${codeContent.length > 1200 ? "..." : ""}`, iteration);

      const files = parseFilesFromResponse(codeContent, session.language);
      await saveFiles(sessionId, files);

      await gitCommitAll(workspacePath, `feat: generated code iteration ${iteration}`);
      await addEvent(sessionId, "git", `Committed iteration ${iteration} files to git`, iteration);

      // Install dependencies before testing
      await installDependencies(workspacePath, session.language, sessionId);

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
        await addEvent(sessionId, "success", `All tests passed on iteration ${iteration}! ✓\n\n${testResult.output.slice(0, 800)}`, iteration);
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
