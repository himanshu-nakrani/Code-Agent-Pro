import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useRoute } from "wouter";
import {
  useCancelSession,
  useGetGitLog,
  useGetGitStatus,
  useGetSession,
  useGitCommit,
  useListSessionEvents,
  useListSessionFiles,
  useListTestResults,
  useRerunSession,
  useUpdateFile,
  getGetGitLogQueryKey,
  getGetGitStatusQueryKey,
  getGetSessionQueryKey,
  getListSessionEventsQueryKey,
  getListSessionFilesQueryKey,
  getListTestResultsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, isValid, formatDistanceToNow } from "date-fns";
import { useSSE } from "@/hooks/use-sse";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Cpu,
  Download,
  FileCode,
  FileJson,
  GitBranch,
  GitCommit as GitCommitIcon,
  Layers,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Square,
  Tag,
  Terminal,
  X as XIcon,
  XCircle,
  ChevronDown,
  ChevronRight,
  Coins,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function safeFormat(value: string | undefined | null, fmt: string, fallback = "--:--:--"): string {
  if (!value) return fallback;
  const date = new Date(value);
  return isValid(date) ? format(date, fmt) : fallback;
}

type ParsedTestCase = {
  name: string;
  passed: boolean;
  duration?: string;
};

function parseTestCases(output: string): ParsedTestCase[] {
  const cases: ParsedTestCase[] = [];
  const seen = new Set<string>();
  const lines = output.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // pytest verbose: "test_foo PASSED" or "tests/test_bar.py::test_baz FAILED"
    const pytestMatch = trimmed.match(/^([\w/:.-]+::\S+|\S+test\S+)\s+(PASSED|FAILED|ERROR)\s*(?:\[[\d.]+%\])?/i);
    if (pytestMatch) {
      const name = pytestMatch[1].replace(/^.*::/, "");
      if (!seen.has(name)) {
        seen.add(name);
        cases.push({ name, passed: pytestMatch[2].toUpperCase() === "PASSED" });
      }
      continue;
    }

    // pytest short: "PASSED" / "FAILED" line with test name on prev processing — handled above
    // Jest/mocha: "✓ test name (42 ms)"
    const passMatch = trimmed.match(/^[✓✔√+]\s+(.+)/u);
    if (passMatch) {
      const raw = passMatch[1];
      const durMatch = raw.match(/^(.+?)\s+\((\d+\s*m?s)\)\s*$/);
      const name = durMatch ? durMatch[1].trim() : raw.replace(/\s+\d+\s*m?s\s*$/, "").trim();
      if (!seen.has(name)) {
        seen.add(name);
        cases.push({ name, passed: true, duration: durMatch?.[2] });
      }
      continue;
    }

    // Jest/mocha: "✗ test name" or "× test name"
    const failMatch = trimmed.match(/^[✗✘×✕]\s+(.+)/u);
    if (failMatch) {
      const name = failMatch[1].trim();
      if (!seen.has(name)) {
        seen.add(name);
        cases.push({ name, passed: false });
      }
      continue;
    }

    // Jest: "    ✓ renders correctly" (indented)
    const indentedPass = trimmed.match(/^[✓✔]\s(.+)/u);
    if (indentedPass && line.startsWith("  ")) {
      const name = indentedPass[1].replace(/\s+\d+\s*m?s\s*$/, "").trim();
      if (!seen.has(name)) {
        seen.add(name);
        cases.push({ name, passed: true });
      }
      continue;
    }

    // Jest summary: "  ● test name"
    const jestFailHeading = line.match(/^\s+●\s+(.+)/);
    if (jestFailHeading) {
      const name = jestFailHeading[1].trim();
      if (!seen.has(name)) {
        seen.add(name);
        cases.push({ name, passed: false });
      }
      continue;
    }

    // node:test / tap: "ok 1 - test name" or "not ok 2 - test name"
    const tapPass = trimmed.match(/^ok\s+\d+\s+-\s+(.+)/);
    if (tapPass) {
      const name = tapPass[1].trim();
      if (!seen.has(name)) { seen.add(name); cases.push({ name, passed: true }); }
      continue;
    }
    const tapFail = trimmed.match(/^not ok\s+\d+\s+-\s+(.+)/);
    if (tapFail) {
      const name = tapFail[1].trim();
      if (!seen.has(name)) { seen.add(name); cases.push({ name, passed: false }); }
      continue;
    }
  }

  return cases;
}

const STATUS_PHASES: Record<string, { label: string; color: string }> = {
  pending:   { label: "QUEUED",    color: "text-amber-400" },
  planning:  { label: "PLANNING",  color: "text-blue-400" },
  coding:    { label: "CODING",    color: "text-violet-400" },
  testing:   { label: "TESTING",   color: "text-sky-400" },
  iterating: { label: "ITERATING", color: "text-orange-400" },
  done:      { label: "DONE",      color: "text-emerald-400" },
  failed:    { label: "FAILED",    color: "text-red-400" },
  cancelled: { label: "CANCELLED", color: "text-gray-400" },
};

const EVENTS_PER_PAGE = 50;

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2,"0")}m ${s.toString().padStart(2,"0")}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2,"0")}s`;
  return `${s}s`;
}

export default function SessionDetail() {
  const [, params] = useRoute("/sessions/:id");
  const sessionId = params?.id ? parseInt(params.id, 10) : undefined;
  const queryClient = useQueryClient();

  const cancelSession = useCancelSession();
  const rerunSession = useRerunSession();
  const updateFile = useUpdateFile();
  const gitCommitMutation = useGitCommit();

  const { toast } = useToast();
  const [editingFileId, setEditingFileId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [eventPage, setEventPage] = useState(0);
  const [gitCommitMessage, setGitCommitMessage] = useState("");
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mobilePanelView, setMobilePanelView] = useState<"workspace" | "stream" | "telemetry">("stream");
  const [tags, setTags] = useState<string[]>(() => {
    if (!sessionId) return [];
    try { return JSON.parse(localStorage.getItem(`forge-tags-${sessionId}`) || "[]"); }
    catch { return []; }
  });
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    localStorage.setItem(`forge-tags-${sessionId}`, JSON.stringify(tags));
  }, [tags, sessionId]);

  const addTag = (t: string) => {
    const trimmed = t.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) setTags((prev) => [...prev, trimmed]);
    setTagInput("");
    setShowTagInput(false);
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  }, []);

  const { data: session, isLoading: isLoadingSession } = useGetSession(sessionId!, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetSessionQueryKey(sessionId!),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status && ["pending", "planning", "coding", "testing", "iterating"].includes(status) ? 2000 : false;
      },
    },
  });

  const isActive = session?.status
    ? ["pending", "planning", "coding", "testing", "iterating"].includes(session.status)
    : false;
  const canRerun = !!session && !isActive && ["done", "failed", "cancelled"].includes(session.status);

  // Live elapsed timer while session is running
  useEffect(() => {
    if (!session || !isActive) { setElapsedSeconds(0); return; }
    const start = new Date(session.createdAt).getTime();
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isActive, session?.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: files = [] } = useListSessionFiles(sessionId!, {
    query: {
      enabled: !!sessionId,
      queryKey: getListSessionFilesQueryKey(sessionId!),
      refetchInterval: isActive ? 2000 : false,
    },
  });

  const { data: fallbackEvents = [] } = useListSessionEvents(sessionId!, {
    query: {
      enabled: !!sessionId && !isActive,
      queryKey: getListSessionEventsQueryKey(sessionId!),
    },
  });

  const { data: testResults = [] } = useListTestResults(sessionId!, {
    query: {
      enabled: !!sessionId,
      queryKey: getListTestResultsQueryKey(sessionId!),
      refetchInterval: isActive ? 2000 : false,
    },
  });

  const { data: gitStatus } = useGetGitStatus(sessionId!, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetGitStatusQueryKey(sessionId!),
      refetchInterval: isActive ? 3000 : false,
    },
  });

  const { data: gitLog = [] } = useGetGitLog(sessionId!, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetGitLogQueryKey(sessionId!),
      refetchInterval: isActive ? 5000 : false,
    },
  });

  const invalidateAll = () => {
    if (!sessionId) return;
    queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getListSessionFilesQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getListSessionEventsQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getListTestResultsQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getGetGitStatusQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getGetGitLogQueryKey(sessionId) });
  };

  const { events: sseEvents, isConnected } = useSSE(isActive ? sessionId : undefined, {
    onStatusChange: (status) => {
      if (!sessionId) return;
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
    },
    onComplete: (finalStatus) => {
      if (!sessionId) return;
      invalidateAll();
      if (finalStatus === "done") {
        toast({ title: "Agent complete", description: "All tests passed successfully." });
      } else if (finalStatus === "failed") {
        toast({ title: "Agent failed", description: "Max iterations reached without passing tests.", variant: "destructive" });
      } else if (finalStatus === "cancelled") {
        toast({ title: "Session cancelled", description: "The agent run was stopped." });
      }
    },
  });

  const events = isActive ? sseEvents : fallbackEvents;

  // When SSE fires test/success/git events, eagerly invalidate related data
  const lastEventCountRef = useRef(0);
  useEffect(() => {
    if (!sessionId || !isActive) return;
    const newEvents = sseEvents.slice(lastEventCountRef.current);
    lastEventCountRef.current = sseEvents.length;
    for (const ev of newEvents) {
      if (ev.type === "test" || ev.type === "success" || ev.type === "error") {
        queryClient.invalidateQueries({ queryKey: getListTestResultsQueryKey(sessionId) });
      }
      if (ev.type === "git") {
        queryClient.invalidateQueries({ queryKey: getGetGitStatusQueryKey(sessionId) });
        queryClient.invalidateQueries({ queryKey: getGetGitLogQueryKey(sessionId) });
      }
      if (ev.type === "code" || ev.type === "success") {
        queryClient.invalidateQueries({ queryKey: getListSessionFilesQueryKey(sessionId) });
      }
    }
  }, [sseEvents, sessionId, isActive, queryClient]);

  const filteredEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    return events.filter((event) => {
      const matchesText = !q || event.content.toLowerCase().includes(q) || event.type.toLowerCase().includes(q);
      const matchesType = eventTypeFilter === "all" || event.type === eventTypeFilter;
      return matchesText && matchesType;
    });
  }, [events, eventSearch, eventTypeFilter]);

  // Reset to last page when events are added live
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const effectiveEventPage = Math.min(eventPage, totalPages - 1);
  const pagedEvents = filteredEvents.slice(
    effectiveEventPage * EVENTS_PER_PAGE,
    (effectiveEventPage + 1) * EVENTS_PER_PAGE
  );

  // Auto-scroll to last page when active
  const prevFilteredLenRef = React.useRef(0);
  useEffect(() => {
    if (isActive && filteredEvents.length > prevFilteredLenRef.current) {
      setEventPage(Math.max(0, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE) - 1));
    }
    prevFilteredLenRef.current = filteredEvents.length;
  }, [filteredEvents.length, isActive]);

  const eventsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredEvents]);

  const selectedFile = files.find((f) => f.id === (selectedFileId ?? files[0]?.id));

  const stats = useMemo(() => {
    const errorCount = events.filter((e) => e.type === "error").length;
    const successCount = events.filter((e) => e.type === "success").length;
    const testCount = testResults.length;
    const passedTests = testResults.filter((t) => t.passed).length;
    const failedTests = testResults.filter((t) => !t.passed).length;
    const eventTypes = {
      thought: events.filter((e) => e.type === "thought").length,
      plan: events.filter((e) => e.type === "plan").length,
      code: events.filter((e) => e.type === "code").length,
      test: events.filter((e) => e.type === "test").length,
    };
    return { errorCount, successCount, passedTests, failedTests, testCount, eventTypes };
  }, [events, testResults]);

  const handleRerun = () => {
    if (!sessionId) return;
    rerunSession.mutate({ id: sessionId }, { onSuccess: invalidateAll });
  };

  const handleCancel = () => {
    if (!sessionId) return;
    cancelSession.mutate({ id: sessionId }, { onSuccess: invalidateAll });
  };

  const handleSaveEdit = () => {
    if (!sessionId || editingFileId === null) return;
    updateFile.mutate(
      { id: sessionId, fileId: editingFileId, data: { content: editContent } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSessionFilesQueryKey(sessionId) }) }
    );
    setEditingFileId(null);
  };

  const handleGitCommit = () => {
    if (!sessionId || !gitCommitMessage.trim()) return;
    gitCommitMutation.mutate(
      { id: sessionId, data: { message: gitCommitMessage.trim() } },
      {
        onSuccess: () => {
          setGitCommitMessage("");
          queryClient.invalidateQueries({ queryKey: getGetGitStatusQueryKey(sessionId) });
          queryClient.invalidateQueries({ queryKey: getGetGitLogQueryKey(sessionId) });
        },
      }
    );
  };

  const toggleTestExpanded = (id: number) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const phaseInfo = STATUS_PHASES[session?.status ?? ""] ?? STATUS_PHASES.pending;

  if (isLoadingSession) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background text-primary">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <div className="p-8 font-mono text-destructive">SESSION_NOT_FOUND</div>;
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card shrink-0 flex items-center px-4 justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/">
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-none hover:bg-muted shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="h-4 w-[1px] bg-border shrink-0" />
          <button
            className="font-mono text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 group shrink-0"
            onClick={() => handleCopy(`ID_${session.id.toString().padStart(4, "0")}`, "session-id")}
            title="Copy session ID"
          >
            ID_{session.id.toString().padStart(4, "0")}
            {copiedId === "session-id"
              ? <ClipboardCheck className="w-3 h-3 text-emerald-400 ml-0.5" />
              : <Copy className="w-3 h-3 ml-0.5 opacity-0 group-hover:opacity-60 transition-opacity" />}
          </button>

          {/* Phase indicator */}
          <div className={`font-mono text-[10px] uppercase font-bold flex items-center gap-1 shrink-0 ${phaseInfo.color}`}>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
            {phaseInfo.label}
          </div>

          {isConnected && isActive && (
            <Badge variant="outline" className="font-mono text-[10px] rounded-none uppercase border-emerald-500/30 text-emerald-400 bg-emerald-500/10 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />LIVE
            </Badge>
          )}

          {isActive && elapsedSeconds > 0 && (
            <Badge variant="outline" className="font-mono text-[10px] rounded-none uppercase border-amber-500/30 text-amber-400 bg-amber-500/10 shrink-0 hidden sm:flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{formatElapsed(elapsedSeconds)}
            </Badge>
          )}

          {session.model && (
            <Badge variant="outline" className="font-mono text-[10px] rounded-none uppercase border-border text-muted-foreground/60 shrink-0 hidden sm:flex items-center gap-1">
              <Cpu className="w-2.5 h-2.5" />
              {session.model}
            </Badge>
          )}
          <div className="font-mono text-xs text-muted-foreground truncate hidden md:block max-w-[300px]">
            {session.task}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex flex-col gap-1">
            <div className="font-mono text-xs text-muted-foreground">
              ITER: <span className="text-foreground font-bold">{session.iterations}</span>
              <span className="text-muted-foreground/50"> / 5</span>
            </div>
            <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min((session.iterations / 5) * 100, 100)}%` }}
              />
            </div>
          </div>
          <button
            onClick={() => setShowTagInput(true)}
            className="font-mono text-[10px] h-8 px-2 border border-border hover:border-primary/40 hover:text-primary text-muted-foreground/60 transition-colors flex items-center gap-1 shrink-0"
            title="Add tag"
          >
            <Tag className="w-3 h-3" />
            {tags.length > 0 && <span className="text-primary">{tags.length}</span>}
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/agent/sessions/${sessionId}/download`, "_blank")}
            className="font-mono text-xs h-8 rounded-none border-border hover:border-primary hover:text-primary"
          >
            <Download className="w-3 h-3 mr-1.5" />ZIP
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/agent/sessions/${sessionId}/export`, "_blank")}
            className="font-mono text-xs h-8 rounded-none border-border hover:border-primary hover:text-primary"
          >
            <FileJson className="w-3 h-3 mr-1.5" />JSON
          </Button>
          {canRerun && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRerun}
              disabled={rerunSession.isPending}
              className="font-mono text-xs h-8 rounded-none border-primary/40 text-primary hover:bg-primary/10"
            >
              <RefreshCw className={`w-3 h-3 mr-1.5 ${rerunSession.isPending ? "animate-spin" : ""}`} />
              RERUN
            </Button>
          )}
          {isActive && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={cancelSession.isPending}
              className="font-mono text-xs h-8 rounded-none"
            >
              <Square className="w-3 h-3 mr-1.5" />ABORT
            </Button>
          )}
        </div>
      </header>

      {/* Tags bar */}
      {(tags.length > 0 || showTagInput) && (
        <div className="shrink-0 border-b border-border bg-card/40 flex items-center px-4 gap-2 h-8">
          <Tag className="w-3 h-3 text-muted-foreground/40 shrink-0" />
          {tags.map((t) => (
            <span key={t} className="flex items-center gap-0.5 font-mono text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-sm">
              {t}
              <button onClick={() => removeTag(t)} className="ml-0.5 hover:text-destructive transition-colors">
                <XIcon className="w-2 h-2" />
              </button>
            </span>
          ))}
          {showTagInput ? (
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag(tagInput);
                if (e.key === "Escape") { setShowTagInput(false); setTagInput(""); }
              }}
              onBlur={() => { if (tagInput.trim()) addTag(tagInput); else { setShowTagInput(false); setTagInput(""); } }}
              className="font-mono text-[9px] bg-transparent outline-none text-foreground w-24"
              placeholder="add tag..."
            />
          ) : (
            <button
              onClick={() => setShowTagInput(true)}
              className="font-mono text-[9px] text-muted-foreground/40 hover:text-primary transition-colors"
            >
              + tag
            </button>
          )}
        </div>
      )}

      {/* Mobile panel switcher */}
      <div className="shrink-0 border-b border-border bg-card px-2 flex items-center gap-1 md:hidden h-9">
        {(["workspace", "stream", "telemetry"] as const).map((panel) => (
          <button
            key={panel}
            onClick={() => setMobilePanelView(panel)}
            className={`font-mono text-[9px] uppercase px-2.5 py-1 flex items-center gap-1 transition-colors ${
              mobilePanelView === panel
                ? "bg-primary/20 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            {panel === "workspace" && <FileCode className="w-2.5 h-2.5" />}
            {panel === "stream" && <Activity className="w-2.5 h-2.5" />}
            {panel === "telemetry" && <Layers className="w-2.5 h-2.5" />}
            {panel === "workspace" ? "Files" : panel === "stream" ? "Stream" : "Info"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: File panel */}
        <div className={`w-full md:w-1/4 md:min-w-[220px] md:max-w-[300px] border-r border-border flex-col bg-card ${mobilePanelView === "workspace" ? "flex" : "hidden md:flex"}`}>
          <div className="h-10 border-b border-border flex items-center px-3 font-mono text-xs text-muted-foreground uppercase bg-background shrink-0">
            <FileCode className="w-3 h-3 mr-2" />Workspace
            <span className="ml-auto text-[10px]">{files.length} {files.length === 1 ? "file" : "files"}</span>
          </div>

          {/* File list */}
          <div className="border-b border-border shrink-0" style={{ maxHeight: "35%" }}>
            <ScrollArea className="h-full">
              <div className="p-2 flex flex-col gap-0.5">
                {files.length === 0 ? (
                  <div className="text-center p-4 font-mono text-[10px] text-muted-foreground">
                    {isActive ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span>GENERATING...</span>
                      </div>
                    ) : "NO_FILES_YET"}
                  </div>
                ) : (
                  files.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => { setSelectedFileId(file.id); setEditingFileId(null); }}
                      className={`text-left px-2 py-1.5 font-mono text-xs truncate transition-colors flex items-center gap-2 w-full rounded-sm ${
                        selectedFile?.id === file.id
                          ? "bg-primary/10 text-primary border-l-2 border-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent"
                      }`}
                    >
                      <FileCode className="w-3 h-3 shrink-0 opacity-50" />
                      <span className="truncate">{file.name}</span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* File content */}
          <div className="flex-1 bg-background overflow-hidden flex flex-col">
            {selectedFile ? (
              <>
                <div className="h-8 shrink-0 bg-muted/20 border-b border-border flex items-center px-3 font-mono text-[10px] text-muted-foreground justify-between gap-2">
                  <span className="truncate">{selectedFile.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-muted-foreground/50">{selectedFile.language}</span>
                    <button
                      onClick={() => handleCopy(selectedFile.content, `file-${selectedFile.id}`)}
                      className="ml-1 p-0.5 text-muted-foreground hover:text-primary transition-colors"
                      title="Copy file contents"
                    >
                      {copiedId === `file-${selectedFile.id}`
                        ? <ClipboardCheck className="w-3 h-3 text-emerald-400" />
                        : <Copy className="w-3 h-3" />
                      }
                    </button>
                    {editingFileId === selectedFile.id ? (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          disabled={updateFile.isPending}
                          className="p-0.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                          title="Save"
                        >
                          <Save className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingFileId(null)}
                          className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                          title="Cancel"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setEditingFileId(selectedFile.id); setEditContent(selectedFile.content); }}
                        className="p-0.5 text-muted-foreground hover:text-primary transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                {editingFileId === selectedFile.id ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 w-full p-3 font-mono text-[11px] bg-background text-foreground resize-none focus:outline-none border-0 leading-relaxed"
                    spellCheck={false}
                  />
                ) : (
                  <ScrollArea className="flex-1">
                    <pre className="p-3 text-[11px] font-mono leading-relaxed text-foreground/90 overflow-x-auto whitespace-pre-wrap break-all">
                      <code>{selectedFile.content}</code>
                    </pre>
                  </ScrollArea>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center font-mono text-xs text-muted-foreground">
                SELECT_FILE
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE: Event stream */}
        <div className={`flex-1 border-r border-border flex-col bg-background min-w-0 ${mobilePanelView === "stream" ? "flex" : "hidden md:flex"}`}>
          <div className="h-10 border-b border-border flex items-center px-3 font-mono text-xs text-muted-foreground uppercase bg-card shrink-0 gap-3">
            <Activity className="w-3 h-3" />
            Execution Stream
            <div className="ml-auto flex items-center gap-1 text-[10px]">
              {stats.eventTypes.thought > 0 && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[9px] px-1.5">
                  {stats.eventTypes.thought}×
                </Badge>
              )}
              {stats.eventTypes.plan > 0 && (
                <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[9px] px-1.5">
                  {stats.eventTypes.plan}×
                </Badge>
              )}
              {stats.eventTypes.code > 0 && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[9px] px-1.5">
                  {stats.eventTypes.code}×
                </Badge>
              )}
              {stats.errorCount > 0 && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px] px-1.5">
                  {stats.errorCount}!
                </Badge>
              )}
            </div>
          </div>

          {/* Search/filter */}
          <div className="h-12 border-b border-border bg-card/40 px-3 flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Search events..."
                className="h-8 pl-7 font-mono text-xs rounded-none bg-background"
              />
            </div>
            <div className="w-[140px]">
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                className="h-8 w-full border border-input bg-background px-2 text-xs font-mono rounded-none"
              >
                <option value="all">All</option>
                <option value="thought">thought</option>
                <option value="plan">plan</option>
                <option value="code">code</option>
                <option value="test">test</option>
                <option value="error">error</option>
                <option value="success">success</option>
                <option value="git">git</option>
              </select>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-4">
              {filteredEvents.length === 0 && (
                <div className="text-center p-8 font-mono text-xs text-muted-foreground">
                  {events.length === 0
                    ? isActive
                      ? <div className="flex flex-col items-center gap-3">
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          <span>AGENT IS STARTING UP...</span>
                        </div>
                      : "NO_EVENTS"
                    : "NO_MATCHES"}
                </div>
              )}

              {pagedEvents.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <div className="shrink-0 pt-1">
                    {event.type === "thought" && <div className="w-1.5 h-1.5 rounded-full bg-blue-400/60" />}
                    {event.type === "plan" && <div className="w-1.5 h-1.5 rounded-full bg-violet-400/60" />}
                    {event.type === "code" && <div className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />}
                    {event.type === "test" && <div className="w-1.5 h-1.5 rounded-full bg-sky-400/60" />}
                    {event.type === "error" && <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                    {event.type === "success" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {event.type === "git" && <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`font-mono text-[10px] uppercase font-bold ${
                        event.type === "error" ? "text-red-400" :
                        event.type === "success" ? "text-emerald-400" :
                        event.type === "code" ? "text-amber-400" :
                        event.type === "plan" ? "text-violet-400" :
                        event.type === "thought" ? "text-blue-400" :
                        "text-muted-foreground"
                      }`}>[{event.type}]</span>
                      <span className="font-mono text-[9px] text-muted-foreground/50">
                        {safeFormat(event.createdAt, "HH:mm:ss")}
                      </span>
                      {event.iteration > 0 && (
                        <span className="font-mono text-[9px] text-muted-foreground/40 border border-border px-1">
                          IT:{event.iteration}
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] leading-relaxed relative group ${
                      event.type === "error"
                        ? "text-red-400/90 bg-red-500/10 p-2 border border-red-500/20 rounded-sm"
                        : event.type === "success"
                        ? "text-emerald-400/90 bg-emerald-500/10 p-2 border border-emerald-500/20 rounded-sm"
                        : event.type === "code"
                        ? "text-foreground/80 bg-muted/30 p-2 border border-border rounded-sm"
                        : "text-foreground/75"
                    }`}>
                      {(event.type === "thought" || event.type === "plan") ? (
                        <div className="[&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:my-1 [&>ul]:pl-4 [&>li]:my-0.5 [&>h1]:font-bold [&>h2]:font-bold [&>h3]:font-bold [&>h1,h2,h3]:text-[11px] [&>h1,h2,h3]:font-mono [&>code]:text-[10px] [&>code]:bg-muted/60 [&>code]:px-1 [&>code]:rounded-sm [&>pre]:bg-muted/30 [&>pre]:p-2 [&>pre]:rounded-sm [&>pre]:overflow-x-auto [&>strong]:text-foreground/95 [&>em]:text-foreground/80 font-sans">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <span className="font-mono whitespace-pre-wrap break-words">{event.content}</span>
                      )}
                      {(event.type === "code" || event.type === "error") && (
                        <button
                          onClick={() => handleCopy(event.content, `event-${event.id}`)}
                          className="absolute top-1 right-1 p-0.5 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                          title="Copy"
                        >
                          {copiedId === `event-${event.id}`
                            ? <ClipboardCheck className="w-2.5 h-2.5 text-emerald-400" />
                            : <Copy className="w-2.5 h-2.5" />
                          }
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isActive && (
                <div className="flex gap-3 items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="font-mono text-[10px] text-muted-foreground animate-pulse">
                    {phaseInfo.label}...
                  </span>
                </div>
              )}

              <div ref={eventsEndRef} />
            </div>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="shrink-0 border-t border-border bg-card/40 px-3 h-9 flex items-center justify-between gap-2">
              <button
                onClick={() => setEventPage((p) => Math.max(0, p - 1))}
                disabled={effectiveEventPage === 0}
                className="font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 px-2 py-1 border border-border disabled:cursor-not-allowed"
              >
                ← PREV
              </button>
              <span className="font-mono text-[10px] text-muted-foreground">
                {effectiveEventPage + 1} / {totalPages} · {filteredEvents.length} events
              </span>
              <button
                onClick={() => setEventPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={effectiveEventPage >= totalPages - 1}
                className="font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 px-2 py-1 border border-border disabled:cursor-not-allowed"
              >
                NEXT →
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Telemetry / VCS / History */}
        <div className={`w-full md:w-[320px] md:shrink-0 flex-col bg-card ${mobilePanelView === "telemetry" ? "flex" : "hidden md:flex"}`}>
          <Tabs defaultValue="tests" className="flex-1 flex flex-col overflow-hidden">
            <div className="h-10 border-b border-border bg-background px-2 flex items-center shrink-0">
              <TabsList className="bg-transparent h-8 p-0 gap-3">
                <TabsTrigger value="tests" className="font-mono text-[10px] uppercase data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-2 h-full">
                  Tests
                </TabsTrigger>
                <TabsTrigger value="git" className="font-mono text-[10px] uppercase data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-2 h-full">
                  VCS
                </TabsTrigger>
                <TabsTrigger value="history" className="font-mono text-[10px] uppercase data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-2 h-full">
                  History
                </TabsTrigger>
                <TabsTrigger value="prompt" className="font-mono text-[10px] uppercase data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-2 h-full">
                  Prompt
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden relative">

              {/* ── Tests tab ── */}
              <TabsContent value="tests" className="absolute inset-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
                {/* Stats */}
                <div className="border-b border-border bg-card/40 p-2 shrink-0">
                  <div className="grid grid-cols-3 gap-2 font-mono text-[9px]">
                    <div className="border border-border bg-background p-1.5 text-center rounded-sm">
                      <div className="text-emerald-400 font-bold text-sm">{stats.passedTests}</div>
                      <div className="text-muted-foreground">passed</div>
                    </div>
                    <div className="border border-border bg-background p-1.5 text-center rounded-sm">
                      <div className="text-red-400 font-bold text-sm">{stats.failedTests}</div>
                      <div className="text-muted-foreground">failed</div>
                    </div>
                    <div className="border border-border bg-background p-1.5 text-center rounded-sm">
                      <div className="text-sky-400 font-bold text-sm">{stats.testCount}</div>
                      <div className="text-muted-foreground">runs</div>
                    </div>
                  </div>
                </div>

                {/* Error summary — shown when session failed */}
                {session.status === "failed" && stats.failedTests > 0 && (
                  <div className="border-b border-red-500/30 bg-red-500/5 p-2 shrink-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                      <span className="font-mono text-[10px] uppercase font-bold text-red-400">
                        Last failure
                      </span>
                    </div>
                    {(() => {
                      const lastFail = [...testResults].reverse().find(t => !t.passed);
                      if (!lastFail) return null;
                      const errorText = (lastFail.errors || lastFail.output).slice(0, 300);
                      return (
                        <div className="relative group">
                          <pre className="font-mono text-[9px] text-red-400/80 whitespace-pre-wrap break-words leading-relaxed bg-red-500/10 border border-red-500/20 rounded-sm p-2 max-h-[80px] overflow-y-auto">
                            {errorText}
                          </pre>
                          <button
                            onClick={() => handleCopy(lastFail.errors || lastFail.output, "last-error")}
                            className="absolute top-1 right-1 p-0.5 text-red-400/50 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                            title="Copy error"
                          >
                            {copiedId === "last-error"
                              ? <ClipboardCheck className="w-2.5 h-2.5" />
                              : <Copy className="w-2.5 h-2.5" />
                            }
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <ScrollArea className="flex-1">
                  <div className="p-3 flex flex-col gap-3">
                    {testResults.length === 0 ? (
                      <div className="text-center p-6 font-mono text-[10px] text-muted-foreground">
                        {isActive ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span>WAITING FOR TESTS...</span>
                          </div>
                        ) : "NO_TEST_DATA"}
                      </div>
                    ) : (
                      testResults.map((test) => {
                        const cases = parseTestCases(test.output + (test.errors || ""));
                        const isExpanded = expandedTests.has(test.id);
                        return (
                          <div key={test.id} className="border border-border bg-background rounded-sm overflow-hidden">
                            <button
                              className={`w-full h-9 px-2 flex items-center gap-2 border-b border-border text-left transition-colors hover:bg-muted/20 ${
                                test.passed ? "bg-emerald-500/10" : "bg-red-500/10"
                              }`}
                              onClick={() => toggleTestExpanded(test.id)}
                            >
                              {test.passed
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              }
                              <span className="font-mono text-[10px] uppercase font-bold flex-1">
                                Run #{test.iteration} — {test.passed ? "PASS" : "FAIL"}
                              </span>
                              {cases.length > 0 && (
                                <span className="font-mono text-[9px] text-muted-foreground mr-1">
                                  {cases.filter(c => c.passed).length}/{cases.length}
                                </span>
                              )}
                              <span className="font-mono text-[9px] text-muted-foreground/50">
                                {safeFormat(test.createdAt, "HH:mm:ss")}
                              </span>
                              {isExpanded
                                ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                                : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                              }
                            </button>

                            {/* Per-test case breakdown */}
                            {cases.length > 0 && (
                              <div className="border-b border-border">
                                {cases.map((c, i) => (
                                  <div key={i} className={`flex items-start gap-2 px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 ${
                                    c.passed ? "text-emerald-400/90" : "text-red-400/90"
                                  }`}>
                                    {c.passed
                                      ? <CheckCircle2 className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                                      : <XCircle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                                    }
                                    <span className="flex-1 break-words">{c.name}</span>
                                    {c.duration && (
                                      <span className="text-muted-foreground/50 shrink-0">{c.duration}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Full output (expandable) */}
                            {isExpanded && (
                              <div className="p-2 font-mono text-[10px] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
                                {test.output && (
                                  <div className="text-muted-foreground">{test.output.slice(0, 800)}</div>
                                )}
                                {test.errors && (
                                  <div className="text-red-400 mt-1 bg-red-500/10 p-1 border border-red-500/20 rounded-sm">
                                    {test.errors.slice(0, 500)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ── VCS tab ── */}
              <TabsContent value="git" className="absolute inset-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-3 flex flex-col gap-4">
                    {!gitStatus ? (
                      <div className="text-center p-6 font-mono text-[10px] text-muted-foreground">VCS_UNAVAILABLE</div>
                    ) : (
                      <>
                        {/* Branch */}
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase mb-1 font-mono">Branch</div>
                          <div className="flex items-center gap-2 text-primary bg-primary/10 px-2 py-1.5 border border-primary/20 rounded-sm font-mono text-xs">
                            <GitBranch className="w-3 h-3" />{gitStatus.branch}
                            {gitStatus.initialized && (
                              <Badge variant="outline" className="ml-auto text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                                initialized
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Status sections */}
                        {gitStatus.staged?.length > 0 && (
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase mb-1 font-mono">
                              Staged ({gitStatus.staged.length})
                            </div>
                            {gitStatus.staged.map((f) => (
                              <div key={f} className="text-emerald-400 mb-0.5 truncate pl-2 border-l border-emerald-500/30 text-[10px] font-mono">
                                A {f}
                              </div>
                            ))}
                          </div>
                        )}

                        {gitStatus.modified?.length > 0 && (
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase mb-1 font-mono">
                              Modified ({gitStatus.modified.length})
                            </div>
                            {gitStatus.modified.map((f) => (
                              <div key={f} className="text-amber-400 mb-0.5 truncate pl-2 border-l border-amber-500/30 text-[10px] font-mono">
                                M {f}
                              </div>
                            ))}
                          </div>
                        )}

                        {gitStatus.untracked?.length > 0 && (
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase mb-1 font-mono">
                              Untracked ({gitStatus.untracked.length})
                            </div>
                            {gitStatus.untracked.map((f) => (
                              <div key={f} className="text-muted-foreground mb-0.5 truncate pl-2 border-l border-muted-foreground/30 text-[10px] font-mono">
                                ? {f}
                              </div>
                            ))}
                          </div>
                        )}

                        {gitStatus.staged?.length === 0 && gitStatus.modified?.length === 0 && gitStatus.untracked?.length === 0 && (
                          <div className="text-[10px] text-muted-foreground/50 font-mono pl-2">Working tree clean</div>
                        )}

                        {/* Commit form */}
                        <div className="border-t border-border pt-3">
                          <div className="text-[10px] text-muted-foreground uppercase mb-2 font-mono flex items-center gap-1">
                            <GitCommitIcon className="w-3 h-3" />
                            Commit changes
                          </div>
                          <div className="flex flex-col gap-2">
                            <Input
                              value={gitCommitMessage}
                              onChange={(e) => setGitCommitMessage(e.target.value)}
                              placeholder="feat: describe changes..."
                              className="h-8 font-mono text-xs rounded-none bg-background text-xs"
                              onKeyDown={(e) => { if (e.key === "Enter") handleGitCommit(); }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleGitCommit}
                              disabled={!gitCommitMessage.trim() || gitCommitMutation.isPending || !gitStatus.initialized}
                              className="font-mono text-xs h-8 rounded-none border-primary/40 text-primary hover:bg-primary/10 w-full"
                            >
                              <GitCommitIcon className="w-3 h-3 mr-1.5" />
                              {gitCommitMutation.isPending ? "COMMITTING..." : "COMMIT"}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ── History tab ── */}
              <TabsContent value="history" className="absolute inset-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
                <div className="border-b border-border bg-card/40 p-2 shrink-0">
                  <div className="font-mono text-[9px] text-muted-foreground flex items-center gap-1">
                    <GitCommitIcon className="w-3 h-3" />
                    Commits: <span className="text-foreground font-bold ml-1">{gitLog.length}</span>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-3 flex flex-col gap-3">
                    {gitLog.length === 0 ? (
                      <div className="text-center p-6 font-mono text-[10px] text-muted-foreground">NO_COMMITS</div>
                    ) : (
                      gitLog.map((commit, idx) => (
                        <div
                          key={commit.hash}
                          className={`border-l-4 pl-3 py-1.5 ${
                            idx === 0 ? "border-l-emerald-500" : "border-l-muted-foreground/20"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[10px] text-primary bg-primary/10 px-1 rounded">
                              {commit.hash}
                            </span>
                            {idx === 0 && (
                              <Badge variant="outline" className="text-[8px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-1">
                                HEAD
                              </Badge>
                            )}
                            <span className="font-mono text-[9px] text-muted-foreground ml-auto">
                              {safeFormat(commit.date, "MMM d, HH:mm")}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-foreground/90 break-words">{commit.message}</div>
                          <div className="font-mono text-[9px] text-muted-foreground mt-0.5">{commit.author}</div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ── Prompt inspector tab ── */}
              <TabsContent value="prompt" className="absolute inset-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-3 flex flex-col gap-4">

                    {/* Task */}
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase mb-1.5 font-mono flex items-center gap-1">
                        <Terminal className="w-3 h-3" />
                        Task Directive
                      </div>
                      <div className="bg-background border border-border rounded-sm p-2.5 font-sans text-xs text-foreground/90 leading-relaxed">
                        {session.task}
                      </div>
                    </div>

                    {/* Session context */}
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase mb-1.5 font-mono">
                        Session Context
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-background border border-border rounded-sm p-2 font-mono">
                          <div className="text-[9px] text-muted-foreground mb-0.5">RUNTIME</div>
                          <div className="text-[11px] text-foreground font-bold">{session.language}</div>
                        </div>
                        <div className="bg-background border border-border rounded-sm p-2 font-mono">
                          <div className="text-[9px] text-muted-foreground mb-0.5">MODEL</div>
                          <div className="text-[11px] text-foreground font-bold">{session.model || "gpt-4.1"}</div>
                        </div>
                        <div className="bg-background border border-border rounded-sm p-2 font-mono">
                          <div className="text-[9px] text-muted-foreground mb-0.5">ITERATIONS</div>
                          <div className="text-[11px] text-foreground font-bold">{session.iterations} / 5</div>
                        </div>
                        <div className="bg-background border border-border rounded-sm p-2 font-mono">
                          <div className="text-[9px] text-muted-foreground mb-0.5">STATUS</div>
                          <div className={`text-[11px] font-bold ${(STATUS_PHASES[session.status] ?? STATUS_PHASES.pending).color}`}>
                            {(STATUS_PHASES[session.status] ?? STATUS_PHASES.pending).label}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* System prompt overview */}
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase mb-1.5 font-mono">
                        System Prompt
                      </div>
                      <div className="bg-muted/20 border border-border rounded-sm p-2.5 font-mono text-[10px] text-muted-foreground space-y-1.5">
                        <div className="text-foreground/70">You are an expert {session.language} developer.</div>
                        <div>Your task: analyze the requirements, plan a solution, write clean &amp; tested code.</div>
                        <div>Rules: always write a test file • keep main.{session.language === "python" ? "py" : "js"} as entry point • fix failing tests within {5} iterations.</div>
                        <div>On each iteration: think → plan → write code → run tests → fix errors.</div>
                      </div>
                    </div>

                    {/* Token usage */}
                    {(session.tokenUsage != null && session.tokenUsage > 0) && (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase mb-1.5 font-mono flex items-center gap-1">
                          <Coins className="w-3 h-3" />
                          Token Usage
                        </div>
                        <div className="bg-background border border-border rounded-sm p-2.5 font-mono">
                          <div className="text-2xl font-bold text-amber-400">{session.tokenUsage.toLocaleString()}</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">total tokens consumed</div>
                        </div>
                      </div>
                    )}

                    {/* Thought history summary */}
                    {events.filter(e => e.type === "thought").length > 0 ? (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase mb-1.5 font-mono flex items-center gap-1">
                          Thought Log
                          <span className="text-muted-foreground/50">({events.filter(e => e.type === "thought").length})</span>
                        </div>
                        <div className="flex flex-col gap-2">
                          {events.filter(e => e.type === "thought").map((e) => (
                            <div key={e.id} className="bg-blue-500/5 border border-blue-500/20 rounded-sm p-2">
                              <div className="font-mono text-[9px] text-blue-400/70 mb-1">IT:{e.iteration} · {safeFormat(e.createdAt, "HH:mm:ss")}</div>
                              <div className="font-mono text-[10px] text-foreground/75 leading-relaxed line-clamp-3">
                                {e.content.slice(0, 200)}{e.content.length > 200 ? "…" : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      !isActive && (
                        <div className="text-center py-6 font-mono text-[10px] text-muted-foreground/50 border border-dashed border-border rounded-sm">
                          NO_THOUGHT_LOG
                        </div>
                      )
                    )}

                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
