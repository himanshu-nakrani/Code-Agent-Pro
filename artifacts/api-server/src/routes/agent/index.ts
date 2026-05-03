import { Router, type IRouter } from "express";
import { eq, sql, avg, sum } from "drizzle-orm";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from "fs";
import { join } from "path";
import archiver from "archiver";
import rateLimit from "express-rate-limit";
import { db, sessionsTable, agentFilesTable, agentEventsTable, testResultsTable } from "@workspace/db";
import {
  CreateSessionBody,
  GetSessionParams,
  DeleteSessionParams,
  CancelSessionParams,
  ListSessionFilesParams,
  ListSessionEventsParams,
  ListTestResultsParams,
  GetGitStatusParams,
  GetGitLogParams,
  GitCommitParams,
  GitCommitBody,
  UpdateFileBody,
  UpdateFileParams,
  RerunSessionParams,
  ArchiveSessionBody,
} from "@workspace/api-zod";
import { runAgent, resetAndRerunAgent, getWorkspacePath } from "../../lib/agent-engine";

const router: IRouter = Router();

// Rate limit session creation to 10 per minute per IP
const createSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many sessions created, please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Workspace cleanup: remove workspaces older than 7 days
function cleanupOldWorkspaces() {
  const WORKSPACES_DIR = "/tmp/agent-workspaces";
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  try {
    const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(WORKSPACES_DIR, entry.name);
      try {
        const st = statSync(fullPath);
        if (Date.now() - st.mtimeMs > MAX_AGE_MS) {
          rmSync(fullPath, { recursive: true, force: true });
        }
      } catch { /* ignore */ }
    }
  } catch { /* workspaces dir may not exist yet */ }
}
// Run cleanup on startup (non-blocking)
setTimeout(cleanupOldWorkspaces, 5000);

// List sessions
router.get("/agent/sessions", async (req, res): Promise<void> => {
  const sessions = await db.select().from(sessionsTable).orderBy(sessionsTable.createdAt);
  res.json(sessions);
});

// Create session (rate-limited)
router.post("/agent/sessions", createSessionLimiter, async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.insert(sessionsTable).values({
    task: parsed.data.task,
    language: parsed.data.language,
    model: parsed.data.model || "gpt-4.1",
    status: "pending",
    iterations: 0,
  }).returning();

  res.status(201).json(session);

  // Run agent in background
  runAgent(session.id).catch((err) => {
    req.log.error({ err, sessionId: session.id }, "Agent failed");
  });
});

// Get session detail
router.get("/agent/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const files = await db.select().from(agentFilesTable).where(eq(agentFilesTable.sessionId, params.data.id));
  const events = await db.select().from(agentEventsTable).where(eq(agentEventsTable.sessionId, params.data.id)).orderBy(agentEventsTable.createdAt);
  const testResults = await db.select().from(testResultsTable).where(eq(testResultsTable.sessionId, params.data.id)).orderBy(testResultsTable.createdAt);

  res.json({ ...session, files, events, testResults });
});

// Delete session
router.delete("/agent/sessions/:id", async (req, res): Promise<void> => {
  const params = DeleteSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(agentEventsTable).where(eq(agentEventsTable.sessionId, params.data.id));
  await db.delete(agentFilesTable).where(eq(agentFilesTable.sessionId, params.data.id));
  await db.delete(testResultsTable).where(eq(testResultsTable.sessionId, params.data.id));
  await db.delete(sessionsTable).where(eq(sessionsTable.id, params.data.id));

  res.sendStatus(204);
});

// Re-run session
router.post("/agent/sessions/:id/rerun", async (req, res): Promise<void> => {
  const params = RerunSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [updated] = await db.update(sessionsTable)
    .set({ status: "pending", iterations: 0, updatedAt: new Date() })
    .where(eq(sessionsTable.id, params.data.id))
    .returning();

  res.json(updated);

  resetAndRerunAgent(session.id).catch((err) => {
    req.log.error({ err, sessionId: session.id }, "Rerun agent failed");
  });
});

// Update file content
router.patch("/agent/sessions/:id/files/:fileId", async (req, res): Promise<void> => {
  const params = UpdateFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateFileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [file] = await db.select().from(agentFilesTable).where(eq(agentFilesTable.id, params.data.fileId));
  if (!file || file.sessionId !== params.data.id) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const [updated] = await db.update(agentFilesTable)
    .set({ content: body.data.content, updatedAt: new Date() })
    .where(eq(agentFilesTable.id, params.data.fileId))
    .returning();

  // Also write to disk
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (session) {
    const workspacePath = session.workspacePath || getWorkspacePath(params.data.id);
    const filePath = join(workspacePath, file.name);
    try { writeFileSync(filePath, body.data.content, "utf-8"); } catch { /* ignore */ }
  }

  res.json(updated);
});

// Download session files as zip
router.get("/agent/sessions/:id/download", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const files = await db.select().from(agentFilesTable).where(eq(agentFilesTable.sessionId, id));
  if (files.length === 0) {
    res.status(404).json({ error: "No files to download" });
    return;
  }

  const slug = session.task.slice(0, 30).replace(/[^a-z0-9]/gi, "_").toLowerCase();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="forge_session_${id}_${slug}.zip"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);

  for (const file of files) {
    archive.append(file.content, { name: file.name });
  }

  await archive.finalize();
});

// Export session as JSON
router.get("/agent/sessions/:id/export", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const files = await db.select().from(agentFilesTable).where(eq(agentFilesTable.sessionId, id));
  const events = await db.select().from(agentEventsTable)
    .where(eq(agentEventsTable.sessionId, id))
    .orderBy(agentEventsTable.createdAt);
  const testResults = await db.select().from(testResultsTable)
    .where(eq(testResultsTable.sessionId, id))
    .orderBy(testResultsTable.createdAt);

  const slug = session.task.slice(0, 30).replace(/[^a-z0-9]/gi, "_").toLowerCase();
  res.setHeader("Content-Disposition", `attachment; filename="forge_session_${id}_${slug}.json"`);
  res.json({
    session: { ...session, files, events, testResults },
    exportedAt: new Date().toISOString(),
    version: "1.0",
  });
});

// Archive / unarchive session
router.patch("/agent/sessions/:id/archive", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ArchiveSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const [updated] = await db.update(sessionsTable)
    .set({ archived: body.data.archived, updatedAt: new Date() })
    .where(eq(sessionsTable.id, params.data.id))
    .returning();
  res.json(updated);
});

// Cancel session
router.post("/agent/sessions/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [updated] = await db.update(sessionsTable)
    .set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(sessionsTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// List session files
router.get("/agent/sessions/:id/files", async (req, res): Promise<void> => {
  const params = ListSessionFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const files = await db.select().from(agentFilesTable).where(eq(agentFilesTable.sessionId, params.data.id));
  res.json(files);
});

// List session events
router.get("/agent/sessions/:id/events", async (req, res): Promise<void> => {
  const params = ListSessionEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const events = await db.select().from(agentEventsTable)
    .where(eq(agentEventsTable.sessionId, params.data.id))
    .orderBy(agentEventsTable.createdAt);
  res.json(events);
});

// List test results
router.get("/agent/sessions/:id/test-results", async (req, res): Promise<void> => {
  const params = ListTestResultsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const results = await db.select().from(testResultsTable)
    .where(eq(testResultsTable.sessionId, params.data.id))
    .orderBy(testResultsTable.createdAt);
  res.json(results);
});

// SSE stream for real-time events
router.get("/agent/sessions/:id/stream", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  let lastEventId = 0;
  let closed = false;

  req.on("close", () => { closed = true; });

  const poll = async () => {
    if (closed) return;
    try {
      const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
      if (!session) {
        res.write(`data: ${JSON.stringify({ type: "error", content: "Session not found" })}\n\n`);
        res.end();
        return;
      }

      const events = await db.select().from(agentEventsTable)
        .where(eq(agentEventsTable.sessionId, id))
        .orderBy(agentEventsTable.id);

      for (const event of events) {
        if (event.id > lastEventId) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          lastEventId = event.id;
        }
      }

      res.write(`data: ${JSON.stringify({ type: "status", content: session.status })}\n\n`);

      if (["done", "failed", "cancelled"].includes(session.status)) {
        res.write(`data: ${JSON.stringify({ type: "complete", content: session.status })}\n\n`);
        res.end();
        return;
      }

      setTimeout(poll, 1500);
    } catch {
      if (!closed) setTimeout(poll, 2000);
    }
  };

  poll();
});

// Agent stats
router.get("/agent/stats", async (_req, res): Promise<void> => {
  const [totals] = await db.select({
    total: sql<number>`count(*)`,
    completed: sql<number>`count(*) filter (where status = 'done')`,
    failed: sql<number>`count(*) filter (where status = 'failed')`,
    avgIter: avg(sessionsTable.iterations),
    totalTokens: sum(sessionsTable.tokenUsage),
    avgDuration: sql<number>`avg(extract(epoch from (completed_at - created_at))) filter (where completed_at is not null)`,
  }).from(sessionsTable);

  const [fileCount] = await db.select({ total: sql<number>`count(*)` }).from(agentFilesTable);

  const total = Number(totals?.total || 0);
  const completed = Number(totals?.completed || 0);
  const failed = Number(totals?.failed || 0);
  const successRate = total > 0 ? (completed / total) * 100 : 0;

  res.json({
    totalSessions: total,
    completedSessions: completed,
    failedSessions: failed,
    successRate: Math.round(successRate * 10) / 10,
    avgIterations: Math.round(Number(totals?.avgIter || 0) * 10) / 10,
    totalFilesGenerated: Number(fileCount?.total || 0),
    totalTokensUsed: Number(totals?.totalTokens || 0),
    avgDurationSeconds: Math.round(Number(totals?.avgDuration || 0)),
  });
});

// CSV export of all sessions
router.get("/agent/stats/export", async (_req, res): Promise<void> => {
  const sessions = await db.select().from(sessionsTable).orderBy(sessionsTable.createdAt);
  const header = "id,task,language,model,status,iterations,tokenUsage,archived,createdAt,completedAt\n";
  const rows = sessions.map(s => [
    s.id,
    `"${(s.task || "").replace(/"/g, '""')}"`,
    s.language,
    s.model,
    s.status,
    s.iterations,
    s.tokenUsage,
    s.archived,
    s.createdAt?.toISOString() ?? "",
    s.completedAt?.toISOString() ?? "",
  ].join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="forge_sessions_${Date.now()}.csv"`);
  res.send(header + rows);
});

// Per-model performance stats
router.get("/agent/model-stats", async (_req, res): Promise<void> => {
  const rows = await db.select({
    model: sessionsTable.model,
    total: sql<number>`count(*)`,
    completed: sql<number>`count(*) filter (where status = 'done')`,
    failed: sql<number>`count(*) filter (where status = 'failed')`,
    avgIter: avg(sessionsTable.iterations),
  }).from(sessionsTable).groupBy(sessionsTable.model);

  const result = rows.map((r) => {
    const total = Number(r.total || 0);
    const completed = Number(r.completed || 0);
    const failed = Number(r.failed || 0);
    return {
      model: r.model || "unknown",
      totalSessions: total,
      completedSessions: completed,
      failedSessions: failed,
      successRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
      avgIterations: Math.round(Number(r.avgIter || 0) * 10) / 10,
    };
  });

  res.json(result);
});

// Git status
router.get("/agent/sessions/:id/git/status", async (req, res): Promise<void> => {
  const params = GetGitStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const workspacePath = session.workspacePath || getWorkspacePath(params.data.id);
  const initialized = session.gitInitialized === "true" && existsSync(join(workspacePath, ".git"));

  if (!initialized) {
    res.json({ initialized: false, branch: "main", modified: [], untracked: [], staged: [] });
    return;
  }

  try {
    const statusOutput = execSync(`cd "${workspacePath}" && git status --porcelain 2>&1`, { encoding: "utf-8" }).trim();
    const branch = execSync(`cd "${workspacePath}" && git branch --show-current 2>&1`, { encoding: "utf-8" }).trim() || "main";

    const modified: string[] = [];
    const untracked: string[] = [];
    const staged: string[] = [];

    for (const line of statusOutput.split("\n").filter(Boolean)) {
      const xy = line.slice(0, 2);
      const file = line.slice(3).trim();
      if (xy[0] !== " " && xy[0] !== "?") staged.push(file);
      if (xy[1] === "M") modified.push(file);
      if (xy === "??") untracked.push(file);
    }

    res.json({ initialized: true, branch, modified, untracked, staged });
  } catch {
    res.json({ initialized: true, branch: "main", modified: [], untracked: [], staged: [] });
  }
});

// Git log
router.get("/agent/sessions/:id/git/log", async (req, res): Promise<void> => {
  const params = GetGitLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const workspacePath = session.workspacePath || getWorkspacePath(params.data.id);

  try {
    const logOutput = execSync(
      `cd "${workspacePath}" && git log --pretty=format:"%H|%s|%an|%ai" --max-count=20 2>&1`,
      { encoding: "utf-8" }
    ).trim();

    if (!logOutput) {
      res.json([]);
      return;
    }

    const commits = logOutput.split("\n").map(line => {
      const [hash, message, author, date] = line.split("|");
      return { hash: hash?.slice(0, 8) || "", message: message || "", author: author || "", date: date || "" };
    });

    res.json(commits);
  } catch {
    res.json([]);
  }
});

// Git commit
router.post("/agent/sessions/:id/git/commit", async (req, res): Promise<void> => {
  const params = GitCommitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = GitCommitBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const workspacePath = session.workspacePath || getWorkspacePath(params.data.id);

  try {
    const msg = body.data.message.replace(/"/g, "'");
    execSync(`cd "${workspacePath}" && git add -A && git commit -m "${msg}" 2>&1`, { encoding: "utf-8" });
  } catch {
    // May fail if nothing to commit
  }

  const statusOutput = execSync(`cd "${workspacePath}" && git status --porcelain 2>&1`, { encoding: "utf-8" }).trim();
  const branch = execSync(`cd "${workspacePath}" && git branch --show-current 2>&1`, { encoding: "utf-8" }).trim() || "main";

  res.json({ initialized: true, branch, modified: [], untracked: [], staged: [] });
});

export default router;
