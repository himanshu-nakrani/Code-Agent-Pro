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

const TERMINAL_STATUSES = ["done", "failed", "cancelled"];

async function updateStatus(sessionId: number, status: string, extra?: Partial<typeof sessionsTable.$inferInsert>) {
  const completedAt = TERMINAL_STATUSES.includes(status) ? new Date() : undefined;
  await db.update(sessionsTable)
    .set({ status, updatedAt: new Date(), ...(completedAt ? { completedAt } : {}), ...extra })
    .where(eq(sessionsTable.id, sessionId));
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
  const MAX_RETRIES = 2;
  
  async function installWithRetry(cmd: string, label: string, retries = MAX_RETRIES): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await addEvent(sessionId, "thought", `${label}${attempt > 1 ? ` (attempt ${attempt}/${retries})` : ""}...`, 0);
        const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
        const out = (stdout + stderr).trim();
        
        // Check for actual errors vs warnings
        const lower = out.toLowerCase();
        if (lower.includes("error") && !lower.includes("warning")) {
          throw new Error(out.slice(0, 300));
        }
        
        if (out) await addEvent(sessionId, "thought", `${label} success:\n${out.slice(0, 300)}`, 0);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === retries) {
          logger.warn({ err, sessionId, cmd }, `${label} failed after ${retries} attempts`);
          await addEvent(sessionId, "thought", `${label} warning (continuing anyway): ${msg.slice(0, 150)}`, 0);
          return false;
        }
        await addEvent(sessionId, "thought", `${label} attempt ${attempt} failed, retrying... ${msg.slice(0, 100)}`, 0);
      }
    }
    return false;
  }

  try {
    if (language === "python") {
      const reqFile = join(workspacePath, "requirements.txt");
      if (existsSync(reqFile)) {
        await installWithRetry(
          `pip3 install -r "${reqFile}" --quiet --no-warn-script-location 2>&1`,
          "Installing Python dependencies from requirements.txt"
        );
      } else {
        // Detect imports from python files and install common packages
        try {
          const pyFiles = execSync(`find "${workspacePath}" -name "*.py" 2>/dev/null`, { encoding: "utf-8" })
            .split("\n").filter(Boolean);
          const imports = new Set<string>();
          
          for (const f of pyFiles) {
            try {
              const content = readFileSync(f, "utf-8");
              const matches = content.matchAll(/^(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm);
              for (const m of matches) {
                const pkg = m[1];
                const thirdParty = ["numpy", "pandas", "requests", "flask", "fastapi", "scipy", "matplotlib",
                  "sklearn", "tensorflow", "torch", "pytest", "httpx", "pydantic", "sqlalchemy",
                  "aiohttp", "click", "rich", "typer", "pillow", "cv2", "bs4", "lxml", "django"];
                if (thirdParty.includes(pkg)) {
                  imports.add(pkg === "cv2" ? "opencv-python" : pkg === "bs4" ? "beautifulsoup4" : pkg);
                }
              }
            } catch { /* skip */ }
          }
          
          if (imports.size > 0) {
            const pkgList = [...imports].join(" ");
            await installWithRetry(
              `pip3 install ${pkgList} --quiet --no-warn-script-location 2>&1`,
              `Installing detected Python packages: ${pkgList}`
            );
          }
        } catch (err) {
          logger.warn({ err, sessionId }, "Failed to detect Python imports");
        }
      }
    } else if (language === "javascript" || language === "typescript") {
      const pkgFile = join(workspacePath, "package.json");
      if (existsSync(pkgFile)) {
        await installWithRetry(
          `cd "${workspacePath}" && npm install --silent --prefer-offline 2>&1`,
          "Installing Node.js dependencies from package.json"
        );
      }
    }
  } catch (err) {
    logger.warn({ err, sessionId }, "Dependency installation error (non-fatal, continuing)");
  }
}

function detectErrorType(output: string): string {
  const lower = output.toLowerCase();
  
  // Critical errors (fail fast)
  if (lower.includes("circular require") || lower.includes("circular dependency")) return "CIRCULAR_DEPENDENCY";
  if (lower.includes("maximum call stack") || lower.includes("stack overflow")) return "STACK_OVERFLOW";
  if (lower.includes("out of memory") || lower.includes("heapspace")) return "OUT_OF_MEMORY";
  
  // File/Path errors
  if (lower.includes("enoent") || lower.includes("no such file") || lower.includes("cannot find")) return "MISSING_FILE";
  if (lower.includes("cannot find module") || lower.includes("module not found") || lower.includes("err_module_not_found")) return "MISSING_MODULE";
  
  // Syntax/Parse errors
  if (lower.includes("syntaxerror") || lower.includes("unexpected token")) return "SYNTAX_ERROR";
  if (lower.includes("failed to parse") || lower.includes("unexpected end of json") || lower.includes("json.parse")) return "JSON_ERROR";
  
  // Runtime errors
  if (lower.includes("typeerror") || lower.includes("is not a function")) return "TYPE_ERROR";
  if (lower.includes("referenceerror") || lower.includes("is not defined")) return "REFERENCE_ERROR";
  if (lower.includes("importerror") || lower.includes("modulenotfounderror")) return "IMPORT_ERROR";
  
  // Network/Port errors
  if (lower.includes("eaddrinuse") || lower.includes("address already in use")) return "PORT_IN_USE";
  if (lower.includes("econnrefused") || lower.includes("connection refused")) return "CONNECTION_REFUSED";
  if (lower.includes("econnreset") || lower.includes("connection reset")) return "CONNECTION_RESET";
  
  // Permission/Access errors
  if (lower.includes("permission denied") || lower.includes("eperm") || lower.includes("eacces")) return "PERMISSION_ERROR";
  
  // Async/Promise errors
  if (lower.includes("await") && (lower.includes("syntaxerror") || lower.includes("unexpected identifier"))) return "ASYNC_AWAIT_ERROR";
  if (lower.includes("promise") || lower.includes(".then is not a function")) return "PROMISE_ERROR";
  
  // Test/Assertion errors
  if ((lower.includes("test") || lower.includes("assert")) && lower.includes("fail")) return "TEST_FAILED";
  if (lower.includes("assertion") || lower.includes("assert.throws")) return "ASSERTION_ERROR";
  
  // Performance/Timeout errors
  if (lower.includes("timeout") || lower.includes("exceeded") || lower.includes("timeout exceeded")) return "TIMEOUT";
  
  // Python-specific errors
  if (lower.includes("indentationerror")) return "INDENTATION_ERROR";
  if (lower.includes("keyerror") || lower.includes("valueerror")) return "VALUE_ERROR";
  if (lower.includes("attributeerror")) return "ATTRIBUTE_ERROR";
  if (lower.includes("nameerror") || lower.includes("not defined")) return "REFERENCE_ERROR";
  
  // npm/pip specific errors
  if (lower.includes("peer dep missing") || lower.includes("unmet peer")) return "MISSING_PEER_DEPENDENCY";
  if (lower.includes("conflicting") || lower.includes("conflict")) return "DEPENDENCY_CONFLICT";
  if (lower.includes("deprecated")) return "DEPRECATED_DEPENDENCY";
  
  return "UNKNOWN_ERROR";
}

function extractErrorContext(output: string): string {
  const lines = output.split("\n");
  const errorLines: string[] = [];
  
  // Priority 1: Find actual error message line (not just "at" stack)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    
    // Match error message patterns
    if (lower.match(/^(error|warning|typeerror|syntaxerror|referenceerror|importerror|moduleerror|enoent|eaddrinuse|failed)/) ||
        lower.includes(": error:") ||
        lower.match(/at .+:\d+:\d+/) && errorLines.length === 0) {
      errorLines.push(line);
      
      // Include context line before if available
      if (i > 0 && !errorLines.includes(lines[i - 1])) {
        errorLines.unshift(lines[i - 1]);
      }
      
      // Include next line for additional context
      if (i + 1 < lines.length) {
        errorLines.push(lines[i + 1]);
      }
      
      if (errorLines.length >= 4) break;
    }
  }
  
  // Priority 2: If no error pattern found, take first non-empty line
  if (errorLines.length === 0) {
    for (const line of lines) {
      if (line.trim()) {
        errorLines.push(line);
        if (errorLines.length >= 2) break;
      }
    }
  }
  
  return errorLines.length > 0 ? errorLines.join("\n").slice(0, 400) : output.slice(0, 200);
}

function generateFixPrompt(errorType: string, errorOutput: string): string {
  const context = extractErrorContext(errorOutput);
  
  const prompts: Record<string, string> = {
    "SYNTAX_ERROR": `Syntax error detected. Fix invalid JavaScript/Python syntax (check parentheses, quotes, colons, indentation):\n${context}`,
    "MISSING_MODULE": `Module not found. Add to package.json dependencies or import with correct path:\n${context}`,
    "MISSING_FILE": `File not found. Generate all referenced files in code blocks:\n${context}`,
    "JSON_ERROR": `Invalid JSON format. Fix quotes, commas, braces in package.json or config files:\n${context}`,
    "TYPE_ERROR": `Type error or function missing. Verify all functions are defined before calling:\n${context}`,
    "REFERENCE_ERROR": `Variable or function undefined. Check imports and variable declarations:\n${context}`,
    "IMPORT_ERROR": `Import/require broken. Fix module paths and ensure dependencies are listed:\n${context}`,
    "TIMEOUT": `Code is too slow or infinite loop. Optimize or remove loops:\n${context}`,
    "ASYNC_AWAIT_ERROR": `Async/await syntax error. Mark function as 'async' before using 'await':\n${context}`,
    "PROMISE_ERROR": `Promise error. Use .then()/.catch() or async/await properly:\n${context}`,
    "PORT_IN_USE": `Port conflict. Use a different port or handle port errors:\n${context}`,
    "TEST_FAILED": `Test failure. Fix code logic to pass tests:\n${context}`,
    "ASSERTION_ERROR": `Assertion failed. Review test expectations and fix code:\n${context}`,
    "CIRCULAR_DEPENDENCY": `Circular dependency detected. Refactor imports to remove cycles:\n${context}`,
    "STACK_OVERFLOW": `Stack overflow or infinite recursion. Remove infinite loops or recursive calls:\n${context}`,
    "OUT_OF_MEMORY": `Out of memory. Reduce data processing or use streaming:\n${context}`,
    "INDENTATION_ERROR": `Python indentation error. Fix spacing (use 4 spaces consistently):\n${context}`,
    "VALUE_ERROR": `Invalid value in code. Check data validation and type conversions:\n${context}`,
    "ATTRIBUTE_ERROR": `Object attribute missing. Verify all properties exist before accessing:\n${context}`,
    "CONNECTION_REFUSED": `Connection error. Check if services are running or use correct addresses:\n${context}`,
    "CONNECTION_RESET": `Connection lost. Handle connection errors or retry logic:\n${context}`,
    "PERMISSION_ERROR": `Permission denied. Check file permissions or run with appropriate privileges:\n${context}`,
    "MISSING_PEER_DEPENDENCY": `Missing peer dependency. Add peer dependency to package.json:\n${context}`,
    "DEPENDENCY_CONFLICT": `Dependency version conflict. Resolve conflicting package versions:\n${context}`,
    "DEPRECATED_DEPENDENCY": `Deprecated dependency used. Update to latest compatible version:\n${context}`,
    "UNKNOWN_ERROR": `Code failed. Debug using error message and fix:\n${context}`,
  };
  
  return prompts[errorType] || prompts["UNKNOWN_ERROR"];
}

async function validateGeneratedFiles(workspacePath: string, files: { name: string; content: string; language: string }[], language: string): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check if main file exists
  const mainExt = language === "python" ? ".py" : ".js";
  const mainFile = files.find(f => f.name === `main${mainExt}`);
  const mainExists = !!mainFile;
  
  if (!mainExists) {
    issues.push(`Missing main${mainExt} entry point`);
  }

  // Validate file encodings and content
  for (const file of files) {
    // Check for encoding issues (invalid UTF-8 sequences)
    try {
      Buffer.from(file.content, "utf-8");
    } catch (e) {
      issues.push(`${file.name} has encoding issues`);
    }

    // Check for null bytes or other invalid content
    if (file.content.includes("\0")) {
      issues.push(`${file.name} contains null bytes`);
    }

    // Warn about very long lines (potential encoding or parsing issues)
    const lines = file.content.split("\n");
    const longLines = lines.filter(l => l.length > 1000);
    if (longLines.length > 0) {
      issues.push(`${file.name} has unusually long lines (possible minified/corrupted content)`);
    }
  }

  // Check package.json consistency for JavaScript
  const pkgFile = files.find(f => f.name === "package.json");
  if (pkgFile && (language === "javascript" || language === "typescript")) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      
      // Validate main field
      if (pkg.main && !files.some(f => f.name === pkg.main)) {
        issues.push(`package.json references main: "${pkg.main}" but file not generated`);
      }

      // Validate scripts - NO orphaned test scripts
      if (pkg.scripts) {
        for (const [scriptName, scriptCmd] of Object.entries(pkg.scripts)) {
          const cmd = scriptCmd as string;
          // Flag any test script
          if (scriptName === "test" && cmd !== "echo 'no tests'") {
            const testFileMatch = cmd.match(/(\w+\.test\.js|test_\w+\.js|\w+_test\.js)/);
            if (testFileMatch) {
              const testFile = testFileMatch[1];
              if (!files.some(f => f.name === testFile)) {
                issues.push(`package.json has "test" script but test file "${testFile}" not generated. Remove test script or generate test file.`);
              }
            }
          }
        }
      }

      // Validate dependencies exist and are used
      if (pkg.dependencies) {
        for (const dep of Object.keys(pkg.dependencies)) {
          if (mainExists) {
            const depPattern = new RegExp(`require\\(['"]${dep}['"]\\)|from ['"]${dep}['"]|import.*from ['"]${dep}['"]`, "i");
            if (!depPattern.test(mainFile.content)) {
              // Warn but don't fail - sometimes deps are optional
              if (dep !== "express" && dep !== "body-parser") {
                // Only warn for obvious unused deps
                if (!mainFile.content.includes(dep)) {
                  issues.push(`package.json lists "${dep}" but main file doesn't use it`);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      issues.push(`Invalid package.json: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Check for common syntax issues in all files
  for (const file of files) {
    // JSON validation
    if (file.name.endsWith(".json")) {
      try {
        JSON.parse(file.content);
      } catch (e) {
        issues.push(`Invalid JSON in ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Check for incomplete code (trailing ...)
    if (file.content.includes("...") && !file.name.endsWith(".md") && !file.name.endsWith(".txt")) {
      const lines = file.content.split("\n");
      const lastLine = lines[lines.length - 1]?.trim();
      if (lastLine === "...") {
        issues.push(`${file.name} appears incomplete (ends with ...)`);
      }
    }

    // Check for unfinished comments
    if ((file.content.includes("TODO") || file.content.includes("FIXME")) && !file.name.endsWith(".md")) {
      // Only flag if it's clearly blocking
      if (file.content.includes("TODO:") || file.content.includes("FIXME:")) {
        issues.push(`${file.name} contains unfinished TODO/FIXME - complete the implementation`);
      }
    }

    // Check for common async/await issues in JavaScript
    if ((file.name.endsWith(".js") || file.name.endsWith(".ts")) && mainExists) {
      // Check for await without async (but allow top-level await in modules)
      const hasTopLevelAwait = file.content.includes("await ") && !file.content.includes("async ");
      const isMainFile = file.name === `main${mainExt}`;
      if (hasTopLevelAwait && !isMainFile) {
        // Only flag if it's clearly a problem (not in eval/strict context)
        if (!file.content.includes("\"use strict\"") && !file.content.includes("'use strict'")) {
          issues.push(`${file.name} uses 'await' but function is not declared as 'async'`);
        }
      }

      // Check for unclosed brackets
      const openBrackets = (file.content.match(/\{/g) || []).length;
      const closeBrackets = (file.content.match(/\}/g) || []).length;
      if (openBrackets !== closeBrackets) {
        issues.push(`${file.name} has mismatched braces (${openBrackets} open, ${closeBrackets} close)`);
      }

      // Check for unclosed parentheses
      const openParens = (file.content.match(/\(/g) || []).length;
      const closeParens = (file.content.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        issues.push(`${file.name} has mismatched parentheses (${openParens} open, ${closeParens} close)`);
      }
    }

    // Python-specific checks
    if (file.name.endsWith(".py")) {
      // Check for inconsistent indentation
      const pyLines = file.content.split("\n");
      const indentations = new Set<number>();
      for (const line of pyLines) {
        if (line.trim()) {
          const match = line.match(/^( +)/);
          if (match) indentations.add(match[1].length);
        }
      }
      // Warn if indentation is clearly inconsistent (e.g., 2, 3, 5 spaces)
      if (indentations.size > 3) {
        const sorted = [...indentations].sort((a, b) => a - b);
        const diffs = [];
        for (let i = 1; i < sorted.length; i++) {
          diffs.push(sorted[i] - sorted[i - 1]);
        }
        // If indents don't follow standard pattern (2, 4, or multiples), warn
        if (!diffs.every(d => d === 2 || d === 4 || d % 2 === 0)) {
          issues.push(`${file.name} has inconsistent indentation`);
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function isRealError(output: string): boolean {
  const lower = output.toLowerCase();
  
  // Filter out npm/pip warnings and non-blocking issues
  const warnings = [
    "npm warn",
    "deprecation warning",
    "deprecated",
    "peer dep missing",
    "found 0 vulnerabilities",
    "audit fix not run",
    "up to date",
    "added",
    "packages",
  ];
  
  // If it's just warnings, it's not a real error
  if (warnings.some(w => lower.includes(w))) {
    // But if it has actual error markers, it might still be an error
    if (!lower.includes("error:") && !lower.includes("failed") && !lower.match(/^\s*error at /m)) {
      return false;
    }
  }
  
  // Real error indicators
  const errorMarkers = [
    /^error:/m,
    /syntaxerror/,
    /typeerror/,
    /referenceerror/,
    /^\s+at /m,
    "thrown",
    "uncaught",
    "failed",
    "traceback",
  ];
  
  return errorMarkers.some(marker => {
    if (typeof marker === "string") {
      return lower.includes(marker);
    } else {
      return marker.test(lower);
    }
  });
}

async function runTests(workspacePath: string, language: string): Promise<{ passed: boolean; output: string; errors: string | null; errorType?: string }> {
  let cmd = "";
  let testMethod = "main"; // Track which test method we're using

  if (language === "python") {
    // Check for pytest-compatible test files
    const testFiles = (() => {
      try {
        const out = execSync(`find "${workspacePath}" -type f \\( -name "test_*.py" -o -name "*_test.py" \\) 2>/dev/null`, { encoding: "utf-8" }).trim();
        return out.split("\n").filter(Boolean);
      } catch { return []; }
    })();

    if (testFiles.length > 0) {
      cmd = `cd "${workspacePath}" && timeout 30 python3 -m pytest -v --tb=short 2>&1 || true`;
      testMethod = "pytest";
    } else {
      cmd = `cd "${workspacePath}" && timeout 30 python3 main.py 2>&1 || true`;
      testMethod = "main.py";
    }
  } else if (language === "typescript") {
    const hasPkg = existsSync(join(workspacePath, "package.json"));
    if (hasPkg) {
      try {
        const pkg = JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf-8"));
        if (pkg.scripts?.test && pkg.scripts.test !== "echo 'no test'") {
          cmd = `cd "${workspacePath}" && timeout 30 npm test 2>&1 || true`;
          testMethod = "npm test";
        } else {
          cmd = `cd "${workspacePath}" && timeout 30 npx ts-node main.ts 2>&1 || true`;
          testMethod = "ts-node main.ts";
        }
      } catch {
        cmd = `cd "${workspacePath}" && timeout 30 npx ts-node main.ts 2>&1 || true`;
        testMethod = "ts-node main.ts";
      }
    } else {
      cmd = `cd "${workspacePath}" && timeout 30 npx ts-node main.ts 2>&1 || true`;
      testMethod = "ts-node main.ts";
    }
  } else {
    const hasPkg = existsSync(join(workspacePath, "package.json"));
    if (hasPkg) {
      try {
        const pkg = JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf-8"));
        if (pkg.scripts?.test && pkg.scripts.test !== "echo 'no test'") {
          cmd = `cd "${workspacePath}" && timeout 30 npm test 2>&1 || true`;
          testMethod = "npm test";
        } else {
          cmd = `cd "${workspacePath}" && timeout 30 node main.js 2>&1 || true`;
          testMethod = "node main.js";
        }
      } catch {
        cmd = `cd "${workspacePath}" && timeout 30 node main.js 2>&1 || true`;
        testMethod = "node main.js";
      }
    } else {
      cmd = `cd "${workspacePath}" && timeout 30 node main.js 2>&1 || true`;
      testMethod = "node main.js";
    }
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 35000 });
    const output = (stdout + stderr).trim();
    
    // Use sophisticated error detection instead of just checking for keywords
    const hasRealError = isRealError(output);
    const errorType = hasRealError ? detectErrorType(output) : undefined;
    
    return { 
      passed: !hasRealError, 
      output: output.slice(0, 5000), 
      errors: hasRealError ? output.slice(0, 2000) : null, 
      errorType 
    };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = ((error.stdout || "") + (error.stderr || error.message || "")).trim();
    const hasRealError = isRealError(output);
    const errorType = hasRealError ? detectErrorType(output) : undefined;
    
    return { 
      passed: false, 
      output: output.slice(0, 5000), 
      errors: output.slice(0, 2000), 
      errorType 
    };
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

  // Find all markdown code blocks: look for ``` followed by content and closing ```
  // Pattern: ```[language]\n ... \n```
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/g;
  let match;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    let blockContent = match[1].trim();
    if (!blockContent || blockContent.length < 5) continue;

    const lines = blockContent.split("\n");
    let filename = "";
    let contentStart = 0;

    // CRITICAL: Find filename in first 2 lines. Skip any content before the filename marker.
    for (let lineIdx = 0; lineIdx < Math.min(3, lines.length); lineIdx++) {
      const line = lines[lineIdx].trim();
      // Match: // filename: X or # filename: X (case insensitive, allow variations)
      const match = line.match(/(?:\/\/|#)\s*file?names?:\s*(\S+)/i);
      if (match) {
        filename = match[1];
        contentStart = lineIdx + 1;
        break;
      }
    }

    // If still no filename found, use content-based heuristics
    if (!filename) {
      // JSON detector - check if valid JSON with name/version (package.json pattern)
      if (blockContent.trim().startsWith("{")) {
        try {
          const json = JSON.parse(blockContent);
          if (json.name && json.version) {
            filename = "package.json";
          } else {
            filename = "config.json";
          }
        } catch {
          filename = "config.json";
        }
      }
      // Requirements.txt detector for Python
      else if (language === "python" && (blockContent.includes("==") || blockContent.includes(">="))) {
        filename = "requirements.txt";
      }
      // Default to main file
      else {
        const ext = language === "python" ? ".py" : language === "typescript" ? ".ts" : ".js";
        filename = `main${ext}`;
      }
    }

    // Extract content ONLY after the filename line
    const content = lines.slice(contentStart).join("\n").trim();
    if (!content) continue;

    files.push({ name: filename, content, language: detectLanguage(filename) });
  }

  // Fallback: if no files found, treat entire response as single file
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
    tokenUsage: 0,
    completedAt: null,
    updatedAt: new Date(),
  }).where(eq(sessionsTable.id, sessionId));

  // Clear workspace
  try {
    const wp = getWorkspacePath(sessionId);
    execSync(`rm -rf "${wp}"`, { stdio: "ignore" });
  } catch { /* ignore */ }

  return runAgent(sessionId);
}

async function formatCode(workspacePath: string, language: string): Promise<void> {
  try {
    if (language === "python") {
      await execAsync(`cd "${workspacePath}" && python3 -m black . --quiet 2>&1 || true`, { timeout: 15000 });
    } else {
      await execAsync(`cd "${workspacePath}" && npx prettier --write "**/*.{js,ts,json}" --log-level silent 2>&1 || true`, { timeout: 15000 });
    }
  } catch {
    // Formatting is best-effort, never block agent
  }
}

type IterationRecord = {
  iteration: number;
  errorType: string;
  errorSummary: string;
};

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
  const iterationHistory: IterationRecord[] = [];

  let totalTokens = 0;

  try {
    // Phase 1: Planning
    await updateStatus(sessionId, "planning");
    await addEvent(sessionId, "thought", `Starting to analyze task: "${session.task}"`, 0);

    const sessionModel = session.model || "gpt-4.1";
    const planResponse = await openai.chat.completions.create({
      model: sessionModel,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `You are an expert ${session.language} developer and planner. Given a coding task, create a concise execution plan with 3-5 steps. Be specific about what files you'll create and what each does. Keep the plan brief and actionable.`,
        },
        { role: "user", content: `Task: ${session.task}\n\nCreate an execution plan. List files you'll create and the purpose of each.` },
      ],
    });

    totalTokens += planResponse.usage?.total_tokens ?? 0;
    const plan = planResponse.choices[0]?.message?.content || "No plan generated";
    await addEvent(sessionId, "plan", plan, 0);

    // Phase 2: Code generation loop
    await updateStatus(sessionId, "coding");

    const systemPrompt = `You are an expert ${session.language} developer. Generate clean, well-tested, production-quality code.

**CRITICAL FORMAT RULES:**
1. **EVERY FILE MUST START WITH A FILENAME MARKER** (first line of code block):
   - JavaScript/JSON: // filename: <name>
   - Python: # filename: <name>
   
2. **OUTPUT EACH FILE IN ITS OWN CODE BLOCK:**
   \`\`\`javascript
   // filename: package.json
   { ... }
   \`\`\`
   
   \`\`\`javascript
   // filename: main.js
   const express = require('express');
   ... rest of code ...
   \`\`\`

3. **ABSOLUTELY REQUIRED:**
   - ONLY include "test" script in package.json if you GENERATE a test file (test_*.js, *.test.js, etc.)
   - For simple/demo tasks with no test file: use "start": "node main.js" only
   - Generate COMPLETE, RUNNABLE code with no placeholders
   - Include main.js/main.py that actually runs without errors
   - If you use packages: include package.json with all dependencies
   - If you use Python packages: include requirements.txt
   - Code must produce visible output or serve requests successfully

4. **DO NOT:**
   - Reference test files in package.json unless you generate them
   - Leave TODOs or incomplete code
   - Use placeholder functions
   - Include scripts for files that don't exist`;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      const historyContext = iterationHistory.length > 0
        ? `\n\nPREVIOUS FAILED ATTEMPTS:\n${iterationHistory.map(h =>
            `- Iteration ${h.iteration}: [${h.errorType}] ${h.errorSummary}`
          ).join("\n")}\n\nDo NOT repeat the same approach that already failed. Try a different implementation strategy.`
        : "";

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: iteration === 1
            ? `Task: ${session.task}\n\nPlan:\n${plan}\n\nGenerate complete ${session.language} code:\n1. FIRST line of EVERY code block: // filename: X or # filename: X\n2. Each file in separate markdown code block\n3. For JS: include package.json with ONLY scripts you'll create files for\n4. Create working main.js/main.py that runs without errors\n5. NO test scripts unless you generate test files\n6. Code must be complete and runnable with no placeholders or TODOs`
            : `Task: ${session.task}\n\nIteration ${iteration} FAILED:\n${generateFixPrompt(
                detectErrorType(lastTestOutput),
                lastTestOutput
              )}${historyContext}\n\nREGENERATE ALL FILES with these rules:\n1. FIRST line MUST be: // filename: X or # filename: X\n2. Each file in its own markdown code block\n3. All referenced files MUST be generated (no orphaned scripts)\n4. Complete code only - no ..., TODO, or FIXME\n5. Ensure imports match dependencies`,
        },
      ];

      const codeResponse = await openai.chat.completions.create({
        model: sessionModel,
        max_completion_tokens: 4096,
        messages,
      });

      totalTokens += codeResponse.usage?.total_tokens ?? 0;
      const codeContent = codeResponse.choices[0]?.message?.content || "";
      await addEvent(sessionId, "code", `Generated code (iteration ${iteration}):\n\n${codeContent.slice(0, 1200)}${codeContent.length > 1200 ? "..." : ""}`, iteration);

      const files = parseFilesFromResponse(codeContent, session.language);
      
      // Validate generated files before saving
      const validation = await validateGeneratedFiles(workspacePath, files, session.language);
      if (!validation.valid) {
        const issueList = validation.issues.join("\n- ");
        await addEvent(sessionId, "error", `Pre-flight validation failed:\n- ${issueList}\n\nRegenerating with fixes...`, iteration);
        lastTestOutput = `Validation errors: ${issueList}`;
        continue; // Skip to next iteration without running tests
      }

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

      // Format code (non-blocking, best-effort)
      await formatCode(workspacePath, session.language);

      if (testResult.passed) {
        await addEvent(sessionId, "success", `All tests passed on iteration ${iteration}! ✓\n\n${testResult.output.slice(0, 800)}`, iteration);
        await gitCommitAll(workspacePath, `chore: tests passing - iteration ${iteration}`);
        await updateStatus(sessionId, "done", { iterations: iteration, tokenUsage: totalTokens });
        return;
      } else {
        lastTestOutput = testResult.errors || testResult.output;
        const errorTypeMsg = testResult.errorType ? ` [${testResult.errorType}]` : "";
        const errorSummary = (testResult.errors || testResult.output).slice(0, 200);
        await addEvent(sessionId, "error", `Tests failed on iteration ${iteration}${errorTypeMsg}:\n${testResult.errors?.slice(0, 800) || testResult.output.slice(0, 800)}`, iteration);

        // Record this failed iteration for memory/context
        iterationHistory.push({
          iteration,
          errorType: testResult.errorType || "UNKNOWN_ERROR",
          errorSummary,
        });

        if (iteration < MAX_ITERATIONS) {
          const fixPrompt = testResult.errorType 
            ? generateFixPrompt(testResult.errorType, lastTestOutput)
            : "Debug and fix the errors above";

          await addEvent(sessionId, "thought", `Analyzing errors and preparing fix for iteration ${iteration + 1}...\n\n${fixPrompt}`, iteration);
        }
      }
    }

    // Max iterations reached
    await addEvent(sessionId, "error", `Reached maximum iterations (${MAX_ITERATIONS}) without passing tests. Marking as failed.`, iteration);
    await updateStatus(sessionId, "failed", { iterations: iteration, tokenUsage: totalTokens });

  } catch (err) {
    logger.error({ err, sessionId }, "Agent engine error");
    await addEvent(sessionId, "error", `Agent encountered an unexpected error: ${err instanceof Error ? err.message : String(err)}`, iteration);
    await updateStatus(sessionId, "failed", { tokenUsage: totalTokens });
  }
}
