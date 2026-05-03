import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListSessions,
  useGetAgentStats,
  useGetModelStats,
  useCreateSession,
  useDeleteSession,
  useArchiveSession,
  getListSessionsQueryKey,
  getGetAgentStatsQueryKey,
  getGetModelStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict, isValid } from "date-fns";
import {
  Terminal,
  Activity,
  FileCode,
  Play,
  Trash2,
  Plus,
  Zap,
  Check,
  X,
  Clock,
  ChevronRight,
  Loader2,
  Sparkles,
  Cpu,
  Filter,
  Search,
  FileDown,
  Archive,
  CheckSquare2,
  Square,
  Layers,
  GitBranch,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/theme-switcher";

const TASK_TEMPLATES: {
  label: string;
  task: string;
  language: "python" | "javascript" | "typescript";
}[] = [
  {
    label: "FizzBuzz",
    task: "Write a FizzBuzz program that prints numbers 1-100. For multiples of 3 print Fizz, multiples of 5 print Buzz, multiples of both print FizzBuzz.",
    language: "python",
  },
  {
    label: "REST API",
    task: "Build a simple REST API with an in-memory store that supports CRUD operations for a todo list (create, read, update, delete todos).",
    language: "javascript",
  },
  {
    label: "CSV Parser",
    task: "Write a Python script that reads a CSV file with columns: name, age, score. Parse it, compute the average score, find the top scorer, and print a summary report.",
    language: "python",
  },
  {
    label: "Binary Search",
    task: "Implement a binary search algorithm with comprehensive tests. Include edge cases: empty array, single element, target not found, duplicate elements.",
    language: "python",
  },
  {
    label: "MD→HTML",
    task: "Build a Markdown to HTML converter that handles headings, bold, italic, code blocks, and links. Include test cases.",
    language: "typescript",
  },
  {
    label: "Scraper",
    task: "Write a Python script that fetches and parses HTML from a URL using requests and beautifulsoup4, extracts all links and headings, and prints a structured report.",
    language: "python",
  },
];

function timeAgo(date: string): string {
  try {
    const d = new Date(date);
    if (!isValid(d)) return "—";
    return formatDistanceToNowStrict(d, { addSuffix: true });
  } catch {
    return "—";
  }
}

const ACTIVE_STATUSES = ["pending", "planning", "coding", "testing", "iterating"];
const TERMINAL_STATUSES = ["done", "failed", "cancelled"];

const STATUS_CONFIG: Record<string, { dot: string; text: string; bar: string; label: string }> = {
  done: { dot: "bg-emerald-500", text: "text-emerald-400", bar: "bg-emerald-500", label: "DONE" },
  failed: { dot: "bg-red-500", text: "text-red-400", bar: "bg-red-500", label: "FAILED" },
  cancelled: { dot: "bg-gray-500", text: "text-gray-400", bar: "bg-gray-500", label: "CANCELLED" },
  pending: { dot: "bg-amber-400", text: "text-amber-400", bar: "bg-amber-400", label: "PENDING" },
  planning: { dot: "bg-blue-400", text: "text-blue-400", bar: "bg-blue-400", label: "PLANNING" },
  coding: { dot: "bg-blue-400", text: "text-blue-400", bar: "bg-blue-400", label: "CODING" },
  testing: { dot: "bg-blue-400", text: "text-blue-400", bar: "bg-blue-400", label: "TESTING" },
  iterating: { dot: "bg-blue-400", text: "text-blue-400", bar: "bg-blue-400", label: "ITERATING" },
};

const LANG_DOT: Record<string, string> = {
  python: "bg-blue-400",
  javascript: "bg-yellow-400",
  typescript: "bg-sky-400",
};

const LANG_TEXT: Record<string, string> = {
  python: "text-blue-400",
  javascript: "text-yellow-400",
  typescript: "text-sky-400",
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const {
    data: sessions,
    isLoading: isLoadingSessions,
    refetch: refetchSessions,
  } = useListSessions({
    query: {
      queryKey: getListSessionsQueryKey(),
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!Array.isArray(data)) return 5000;
        const hasActive = (data as { status: string }[]).some((s) =>
          ACTIVE_STATUSES.includes(s.status)
        );
        return hasActive ? 2000 : 8000;
      },
    },
  });
  const { data: stats, isLoading: isLoadingStats } = useGetAgentStats({
    query: { queryKey: getGetAgentStatsQueryKey(), refetchInterval: 10000 },
  });
  const { data: modelStats = [], isLoading: isLoadingModelStats } = useGetModelStats({
    query: { queryKey: getGetModelStatsQueryKey(), refetchInterval: 15000 },
  });

  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const archiveSession = useArchiveSession();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newLang, setNewLang] = useState<"python" | "javascript" | "typescript">("python");
  const [newModel, setNewModel] = useState<"gpt-4.1" | "gpt-4o" | "gpt-4o-mini">("gpt-4.1");
  const [filterLang, setFilterLang] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsDialogOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleCreate = () => {
    if (!newTask.trim()) return;
    createSession.mutate(
      { data: { task: newTask, language: newLang, model: newModel } },
      {
        onSuccess: (res) => {
          setIsDialogOpen(false);
          setNewTask("");
          setLocation(`/sessions/${res.id}`);
        },
      }
    );
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Delete this session and all its files?")) {
      deleteSession.mutate({ id }, { onSuccess: () => refetchSessions() });
    }
  };

  const handleArchive = (id: number, archived: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    archiveSession.mutate(
      { id, data: { archived } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() }) }
    );
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} session(s) and all their files?`)) return;
    const ids = Array.from(selectedIds);
    Promise.all(ids.map((id) => deleteSession.mutateAsync({ id }))).then(() => {
      setSelectedIds(new Set());
      setSelectMode(false);
      refetchSessions();
    });
  };

  const handleBulkArchive = () => {
    const ids = Array.from(selectedIds);
    Promise.all(ids.map((id) => archiveSession.mutateAsync({ id, data: { archived: true } }))).then(() => {
      setSelectedIds(new Set());
      setSelectMode(false);
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    });
  };

  const applyTemplate = (t: (typeof TASK_TEMPLATES)[number]) => {
    setNewTask(t.task);
    setNewLang(t.language);
  };

  const sortedSessions = [...(sessions ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const activeSessions = sortedSessions.filter((s) => ACTIVE_STATUSES.includes(s.status));
  const completedSessions = sortedSessions.filter((s) => {
    if (!TERMINAL_STATUSES.includes(s.status)) return false;
    if (s.archived) return false;
    if (filterLang !== "all" && s.language !== filterLang) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!s.task.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const archivedSessions = sortedSessions.filter((s) => s.archived);
  const hasFilters = filterLang !== "all" || filterStatus !== "all" || !!searchQuery.trim();

  const totalSessions = stats?.totalSessions ?? 0;
  const successRate = stats?.successRate ?? 0;
  const avgIter = stats?.avgIterations ?? 0;
  const filesGenerated = stats?.totalFilesGenerated ?? 0;
  const doneSessions = Math.round((successRate / 100) * totalSessions);

  // Scorecard definitions
  const SCORECARDS = [
    {
      label: "Total Sessions",
      value: isLoadingStats ? null : totalSessions.toString(),
      sub: activeSessions.length > 0 ? `${activeSessions.length} running now` : "all time",
      trend: totalSessions > 0 ? "up" : "neutral",
      icon: <Layers className="w-5 h-5" />,
      accent: "text-orange-400",
      gradientFrom: "from-orange-500/10",
    },
    {
      label: "Success Rate",
      value: isLoadingStats ? null : `${successRate.toFixed(1)}%`,
      sub: totalSessions > 0 ? `${doneSessions} of ${totalSessions} passed` : "no sessions yet",
      trend: successRate >= 50 ? "up" : successRate > 0 ? "down" : "neutral",
      icon: <Activity className="w-5 h-5" />,
      accent: "text-emerald-400",
      gradientFrom: "from-emerald-500/10",
    },
    {
      label: "Avg Iterations",
      value: isLoadingStats ? null : avgIter.toFixed(1),
      sub: "per session",
      trend: "neutral",
      icon: <GitBranch className="w-5 h-5" />,
      accent: "text-blue-400",
      gradientFrom: "from-blue-500/10",
    },
    {
      label: "Files Generated",
      value: isLoadingStats ? null : filesGenerated.toString(),
      sub: "across all sessions",
      trend: filesGenerated > 0 ? "up" : "neutral",
      icon: <FileCode className="w-5 h-5" />,
      accent: "text-purple-400",
      gradientFrom: "from-purple-500/10",
    },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-mono">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-primary flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-[13px] font-bold tracking-widest">FORGE</span>
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider hidden sm:block">
              AI Coding Agent
            </span>
            {activeSessions.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center gap-1">
                <Activity className="w-2.5 h-2.5 animate-pulse" />
                {activeSessions.length} RUNNING
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <Dialog
              open={isDialogOpen}
              onOpenChange={(o) => {
                setIsDialogOpen(o);
                if (!o) setNewTask("");
              }}
            >
              <DialogTrigger asChild>
                <button className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-bold px-3 py-1.5 uppercase tracking-wider transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  New Session
                  <span className="hidden sm:inline font-mono text-[9px] opacity-50 border border-current/30 px-1 py-0.5">⌘K</span>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px] border-border bg-card font-mono">
                <DialogHeader>
                  <DialogTitle className="font-mono text-base uppercase flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Initialize New Agent
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  <div>
                    <Label className="font-mono text-xs text-muted-foreground uppercase mb-2 block">
                      Quick Templates
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {TASK_TEMPLATES.map((t) => (
                        <button
                          key={t.label}
                          onClick={() => applyTemplate(t)}
                          className={`text-left px-2 py-2 border font-mono text-[10px] transition-colors hover:border-primary hover:text-primary hover:bg-primary/5 rounded-sm ${
                            newTask === t.task
                              ? "border-primary text-primary bg-primary/10"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <div className="uppercase font-bold">{t.label}</div>
                          <div className="text-[9px] opacity-60 mt-0.5">{t.language}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-[1px] bg-border" />
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="task" className="font-mono text-xs text-muted-foreground uppercase">
                      Task Directive
                    </Label>
                    <textarea
                      id="task"
                      value={newTask}
                      onChange={(e) => setNewTask(e.target.value)}
                      placeholder="Describe what you want the agent to build..."
                      className="font-mono text-sm bg-background border border-input rounded p-3 resize-none focus:outline-none focus:border-primary transition-colors min-h-[80px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCreate();
                      }}
                    />
                    <div className="text-[10px] text-muted-foreground/50 font-mono">Ctrl+Enter to submit</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="language" className="font-mono text-xs text-muted-foreground uppercase">
                        Runtime
                      </Label>
                      <Select
                        value={newLang}
                        onValueChange={(val: "python" | "javascript" | "typescript") => setNewLang(val)}
                      >
                        <SelectTrigger className="font-mono bg-background border-input rounded-none">
                          <SelectValue placeholder="Select runtime" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="python">🐍 Python 3</SelectItem>
                          <SelectItem value="javascript">🟨 Node.js / JavaScript</SelectItem>
                          <SelectItem value="typescript">🔷 TypeScript</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="model" className="font-mono text-xs text-muted-foreground uppercase flex items-center gap-1">
                        <Cpu className="w-3 h-3" />AI Model
                      </Label>
                      <Select
                        value={newModel}
                        onValueChange={(val: "gpt-4.1" | "gpt-4o" | "gpt-4o-mini") => setNewModel(val)}
                      >
                        <SelectTrigger className="font-mono bg-background border-input rounded-none">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4.1">GPT-4.1 (default)</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreate}
                    disabled={!newTask.trim() || createSession.isPending}
                    className="font-mono w-full gap-2"
                  >
                    {createSession.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />LAUNCHING AGENT...</>
                    ) : (
                      <><Zap className="w-4 h-4" />EXECUTE DIRECTIVE</>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-5 flex flex-col gap-5">
        {/* Scorecard Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SCORECARDS.map((card) => (
            <div
              key={card.label}
              className={`relative bg-card border border-border p-5 overflow-hidden group hover:border-border/80 transition-colors`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradientFrom} to-transparent opacity-60`} />
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <span className={card.accent}>{card.icon}</span>
                  {card.trend === "up" && <TrendingUp className="w-3.5 h-3.5 text-emerald-500/60" />}
                  {card.trend === "down" && <TrendingDown className="w-3.5 h-3.5 text-red-500/60" />}
                </div>
                {card.value === null ? (
                  <Skeleton className="h-9 w-20 bg-muted mb-1" />
                ) : (
                  <div className={`text-3xl font-bold tracking-tight mb-0.5 ${card.accent}`}>
                    {card.value}
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  {card.label}
                </div>
                <div className="text-[10px] text-muted-foreground/40">{card.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Model Performance Band */}
        {(isLoadingModelStats || modelStats.length > 0) && (
          <div className="border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Model Performance
                </span>
              </div>
              {!isLoadingModelStats && (
                <span className="text-[9px] text-muted-foreground/40">
                  {modelStats.reduce((a, m) => a + m.totalSessions, 0)} total runs
                </span>
              )}
            </div>
            {isLoadingModelStats ? (
              <div className="px-4 py-3">
                <Skeleton className="h-8 w-full bg-muted" />
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {modelStats.map((m) => (
                  <div key={m.model} className="px-4 py-3 flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2 w-28 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      <span className="text-[11px] text-foreground/70 font-mono">{m.model}</span>
                    </div>
                    <div className="flex items-center gap-5">
                      <div>
                        <div className="text-base font-bold text-emerald-400">
                          {m.successRate.toFixed(0)}%
                        </div>
                        <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">
                          Success
                        </div>
                      </div>
                      <div>
                        <div className="text-base font-bold text-blue-400">
                          {m.avgIterations.toFixed(1)}
                        </div>
                        <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">
                          Avg Iter
                        </div>
                      </div>
                      <div>
                        <div className="text-base font-bold text-red-400">{m.failedSessions}</div>
                        <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">
                          Failed
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-32 max-w-52">
                      <div className="flex justify-between text-[9px] text-muted-foreground/40 mb-1">
                        <span>pass rate</span>
                        <span>{m.successRate.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(m.successRate, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground/30 ml-auto">
                      {m.totalSessions} runs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <div className="border border-blue-500/20 bg-blue-500/5">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-500/10">
              <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-blue-400/70 font-bold">
                Running ({activeSessions.length})
              </span>
            </div>
            <div className="divide-y divide-blue-500/10">
              {activeSessions.map((session) => {
                const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;
                return (
                  <Link key={session.id} href={`/sessions/${session.id}`}>
                    <div className="flex items-center gap-0 hover:bg-blue-500/5 cursor-pointer group transition-colors">
                      <div className={`w-0.5 self-stretch ${cfg.bar} opacity-60`} />
                      <div className="flex items-center gap-3 px-4 py-2.5 flex-1 min-w-0">
                        <span className="text-[10px] text-muted-foreground/30 shrink-0 w-14">
                          ID_{session.id.toString().padStart(4, "0")}
                        </span>
                        <div className={`flex items-center gap-1 shrink-0 ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${cfg.dot}`} />
                          <span className="text-[10px] uppercase tracking-wider">{cfg.label}</span>
                        </div>
                        <span className={`text-[10px] shrink-0 ${LANG_TEXT[session.language] ?? "text-muted-foreground"}`}>
                          {session.language}
                        </span>
                        <span className="text-[11px] text-foreground/60 truncate flex-1">
                          {session.task}
                        </span>
                        <div className="flex items-center gap-3 shrink-0 ml-auto">
                          <span className="text-[10px] text-muted-foreground/30">
                            {session.iterations} iter
                          </span>
                          <span className="text-[10px] text-muted-foreground/25">
                            {timeAgo(session.createdAt)}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed Sessions */}
        <div className="border border-border">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                {activeSessions.length > 0 ? "Completed" : "Recent Directives"}
              </span>
              {!isLoadingSessions && completedSessions.length > 0 && (
                <span className="text-[10px] text-muted-foreground/30">
                  ({completedSessions.length})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1 bg-background border border-input px-2 py-1">
                <Search className="w-3 h-3 text-muted-foreground/40" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="h-4 p-0 font-mono text-[10px] border-0 bg-transparent focus-visible:ring-0 w-[130px] rounded-none"
                />
              </div>
              <Filter className="w-3 h-3 text-muted-foreground/30 shrink-0" />
              <Select value={filterLang} onValueChange={setFilterLang}>
                <SelectTrigger className="font-mono text-[10px] h-6 rounded-none bg-background border-input w-[100px] px-2">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-mono text-xs">All langs</SelectItem>
                  <SelectItem value="python" className="font-mono text-xs">Python</SelectItem>
                  <SelectItem value="javascript" className="font-mono text-xs">JavaScript</SelectItem>
                  <SelectItem value="typescript" className="font-mono text-xs">TypeScript</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="font-mono text-[10px] h-6 rounded-none bg-background border-input w-[90px] px-2">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-mono text-xs">All status</SelectItem>
                  <SelectItem value="done" className="font-mono text-xs">Done</SelectItem>
                  <SelectItem value="failed" className="font-mono text-xs">Failed</SelectItem>
                  <SelectItem value="cancelled" className="font-mono text-xs">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters && (
                <button
                  onClick={() => { setFilterLang("all"); setFilterStatus("all"); setSearchQuery(""); }}
                  className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                className={`font-mono text-[10px] h-6 px-2 border transition-colors flex items-center gap-1 ${
                  selectMode ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {selectMode ? <CheckSquare2 className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                SELECT
              </button>
              <a
                href="/api/agent/stats/export"
                download
                className="font-mono text-[10px] h-6 px-2 border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center gap-1"
              >
                <FileDown className="w-3 h-3" />CSV
              </a>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/20">
              <span className="font-mono text-[10px] text-muted-foreground flex-1">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleBulkArchive}
                className="font-mono text-[10px] px-2 py-0.5 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center gap-1"
              >
                <Archive className="w-3 h-3" />Archive
              </button>
              <button
                onClick={handleBulkDelete}
                className="font-mono text-[10px] px-2 py-0.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Session rows */}
          <div className="divide-y divide-border/60">
            {isLoadingSessions &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Skeleton className="h-3 w-12 bg-muted" />
                  <Skeleton className="h-3 w-16 bg-muted" />
                  <Skeleton className="h-3 w-20 bg-muted" />
                  <Skeleton className="h-3 flex-1 bg-muted" />
                  <Skeleton className="h-3 w-10 bg-muted" />
                </div>
              ))}

            {!isLoadingSessions && sortedSessions.length === 0 && (
              <div className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
                    <Terminal className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-foreground mb-1">
                      No sessions yet
                    </div>
                    <div className="font-mono text-xs text-muted-foreground mb-4">
                      Launch your first AI coding agent to get started
                    </div>
                    <Button
                      variant="default"
                      className="font-mono text-sm gap-2"
                      onClick={() => setIsDialogOpen(true)}
                    >
                      <Zap className="w-4 h-4" />
                      Create First Session
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {completedSessions.map((session, idx) => {
              const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.failed;
              return (
                <div key={session.id} className="relative flex items-center gap-0">
                  {selectMode && (
                    <button
                      onClick={(e) => toggleSelect(session.id, e)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {selectedIds.has(session.id)
                        ? <CheckSquare2 className="w-3.5 h-3.5 text-primary" />
                        : <Square className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <Link href={`/sessions/${session.id}`} className="flex-1 min-w-0">
                    <div
                      className={`flex items-center gap-0 hover:bg-muted/30 cursor-pointer group transition-colors ${
                        selectedIds.has(session.id) ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className={`w-0.5 self-stretch ${cfg.bar} opacity-60`} />
                      <div className={`flex items-center gap-3 px-4 py-2.5 flex-1 min-w-0 ${selectMode ? "pl-10" : ""}`}>
                        <span className="text-[10px] text-muted-foreground/25 shrink-0 w-14">
                          ID_{session.id.toString().padStart(4, "0")}
                        </span>
                        <div className={`flex items-center gap-1 shrink-0 w-20 ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                          <span className="text-[10px] uppercase tracking-wider">{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 w-24">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LANG_DOT[session.language] ?? "bg-muted-foreground"}`} />
                          <span className={`text-[10px] ${LANG_TEXT[session.language] ?? "text-muted-foreground"}`}>
                            {session.language}
                          </span>
                        </div>
                        <span className="text-[11px] text-foreground/55 truncate flex-1">
                          {session.task}
                        </span>
                        <div className="flex items-center gap-4 shrink-0 ml-auto">
                          <span className="text-[10px] text-muted-foreground/30 hidden sm:block">
                            {session.iterations} iter
                          </span>
                          <span className="text-[10px] text-muted-foreground/25 hidden sm:block">
                            {timeAgo(session.updatedAt)}
                          </span>
                          {!selectMode && (
                            <>
                              <button
                                onClick={(e) => handleArchive(session.id, true, e)}
                                className="text-muted-foreground/20 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all"
                                title="Archive"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(session.id, e)}
                                className="text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 opacity-0 group-hover:opacity-60 transition-opacity" />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {/* Archived Sessions */}
        {archivedSessions.length > 0 && (
          <div className="border border-border/50">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
              <Archive className="w-3 h-3 text-muted-foreground/30" />
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground/30 font-bold">
                Archived ({archivedSessions.length})
              </span>
            </div>
            <div className="divide-y divide-border/30">
              {archivedSessions.map((session) => {
                const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.failed;
                return (
                  <div
                    key={session.id}
                    className="group flex items-center gap-0 opacity-50 hover:opacity-70 transition-opacity"
                  >
                    <div className={`w-0.5 self-stretch ${cfg.bar} opacity-40`} />
                    <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
                      <span className="text-[10px] text-muted-foreground/30 shrink-0 w-14">
                        ID_{session.id.toString().padStart(4, "0")}
                      </span>
                      <div className={`flex items-center gap-1 shrink-0 w-20 ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        <span className="text-[10px] uppercase tracking-wider">{cfg.label}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground/40 truncate flex-1">
                        {session.task}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleArchive(session.id, false, e)}
                          className="font-mono text-[10px] px-2 py-0.5 border border-border text-muted-foreground hover:text-amber-400 hover:border-amber-500/30 transition-colors"
                        >
                          Restore
                        </button>
                        <button
                          onClick={(e) => handleDelete(session.id, e)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
