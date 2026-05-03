import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListSessions,
  useGetAgentStats,
  useCreateSession,
  useDeleteSession,
  getListSessionsQueryKey,
  getGetAgentStatsQueryKey,
} from "@workspace/api-client-react";
import { format, formatDistanceToNowStrict, isValid } from "date-fns";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newLang, setNewLang] = useState<"python" | "javascript" | "typescript">("python");
  const [newModel, setNewModel] = useState<"gpt-4.1" | "gpt-4o" | "gpt-4o-mini">("gpt-4.1");
  const [filterLang, setFilterLang] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Cmd+K / Ctrl+K shortcut to open new session dialog
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

  const applyTemplate = (t: (typeof TASK_TEMPLATES)[number]) => {
    setNewTask(t.task);
    setNewLang(t.language);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "done":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "failed":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "cancelled":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "pending":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default:
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <Check className="w-3 h-3 mr-1" />;
      case "failed":
        return <X className="w-3 h-3 mr-1" />;
      case "cancelled":
        return <X className="w-3 h-3 mr-1" />;
      case "pending":
        return <Clock className="w-3 h-3 mr-1" />;
      default:
        return <Activity className="w-3 h-3 mr-1 animate-pulse" />;
    }
  };

  const getLangColor = (lang: string) => {
    switch (lang) {
      case "python":
        return "text-blue-400 border-blue-500/30 bg-blue-500/10";
      case "javascript":
        return "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
      case "typescript":
        return "text-sky-400 border-sky-500/30 bg-sky-500/10";
      default:
        return "text-muted-foreground";
    }
  };

  // Sorted newest-first, with language + status filters applied to completed
  const sortedSessions = [...(sessions ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const activeSessions = sortedSessions.filter((s) => ACTIVE_STATUSES.includes(s.status));
  const completedSessions = sortedSessions.filter((s) => {
    if (!TERMINAL_STATUSES.includes(s.status)) return false;
    if (filterLang !== "all" && s.language !== filterLang) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    return true;
  });
  const hasFilters = filterLang !== "all" || filterStatus !== "all";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
              <Terminal className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight font-mono">FORGE</h1>
            <span className="text-xs text-muted-foreground font-mono hidden sm:block">
              AI Coding Agent
            </span>
            {activeSessions.length > 0 && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] rounded-none border-blue-500/30 text-blue-400 bg-blue-500/10 ml-1"
              >
                <Activity className="w-2.5 h-2.5 mr-1 animate-pulse" />
                {activeSessions.length} RUNNING
              </Badge>
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
                <Button variant="default" className="font-mono text-sm gap-2">
                  <Plus className="w-4 h-4" />
                  NEW SESSION
                  <span className="hidden sm:inline font-mono text-[10px] opacity-50 border border-current/30 px-1 py-0.5 rounded-sm">⌘K</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px] border-border bg-card">
                <DialogHeader>
                  <DialogTitle className="font-mono text-base uppercase flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Initialize New Agent
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  {/* Templates */}
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

                  {/* Custom task */}
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="task"
                      className="font-mono text-xs text-muted-foreground uppercase"
                    >
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
                    <div className="text-[10px] text-muted-foreground/50 font-mono">
                      Ctrl+Enter to submit
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label
                        htmlFor="language"
                        className="font-mono text-xs text-muted-foreground uppercase"
                      >
                        Runtime
                      </Label>
                      <Select
                        value={newLang}
                        onValueChange={(val: "python" | "javascript" | "typescript") =>
                          setNewLang(val)
                        }
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
                      <Label
                        htmlFor="model"
                        className="font-mono text-xs text-muted-foreground uppercase flex items-center gap-1"
                      >
                        <Cpu className="w-3 h-3" />
                        AI Model
                      </Label>
                      <Select
                        value={newModel}
                        onValueChange={(val: "gpt-4.1" | "gpt-4o" | "gpt-4o-mini") =>
                          setNewModel(val)
                        }
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
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        LAUNCHING AGENT...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        EXECUTE DIRECTIVE
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Total Sessions",
              icon: Activity,
              value: stats?.totalSessions ?? 0,
              format: (v: number) => v.toString(),
            },
            {
              label: "Success Rate",
              icon: Check,
              value: stats?.successRate ?? 0,
              format: (v: number) => `${v.toFixed(1)}%`,
            },
            {
              label: "Avg Iterations",
              icon: Play,
              value: stats?.avgIterations ?? 0,
              format: (v: number) => v.toFixed(1),
            },
            {
              label: "Files Generated",
              icon: FileCode,
              value: stats?.totalFilesGenerated ?? 0,
              format: (v: number) => v.toString(),
            },
          ].map(({ label, icon: Icon, value, format: fmt }) => (
            <Card key={label} className="bg-card border-border rounded-sm shadow-none">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-2">
                  <Icon className="w-3 h-3" />
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-16 bg-muted" />
                ) : (
                  <div className="text-3xl font-mono font-bold text-primary">{fmt(value)}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <div>
            <h2 className="text-xs font-mono font-bold uppercase mb-3 text-muted-foreground flex items-center gap-2">
              <Activity className="w-3 h-3 animate-pulse text-blue-400" />
              Running ({activeSessions.length})
            </h2>
            <div className="grid gap-2">
              {activeSessions.map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <div className="group border border-blue-500/20 bg-blue-500/5 p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/10 transition-colors rounded-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                        <Activity className="w-3 h-3 text-blue-400 animate-pulse" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">
                            ID_{session.id.toString().padStart(4, "0")}
                          </span>
                          <Badge
                            variant="outline"
                            className={`font-mono text-[10px] rounded-none uppercase border ${getStatusStyle(session.status)}`}
                          >
                            {getStatusIcon(session.status)}
                            {session.status}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`font-mono text-[9px] rounded-none uppercase border ${getLangColor(session.language)}`}
                          >
                            {session.language}
                          </Badge>
                        </div>
                        <p className="font-sans text-sm text-foreground truncate max-w-[500px]">
                          {session.task}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right text-[10px] font-mono text-muted-foreground hidden sm:block">
                        <div>{timeAgo(session.createdAt)}</div>
                        <div>iter {session.iterations}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Completed / All Sessions */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="text-xs font-mono font-bold uppercase text-muted-foreground flex items-center gap-2 shrink-0">
              {activeSessions.length > 0 ? "Completed" : "Recent Directives"}
              {!isLoadingSessions && completedSessions.length > 0 && (
                <span className="text-muted-foreground/40">({completedSessions.length})</span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <Filter className="w-3 h-3 text-muted-foreground/50 shrink-0" />
              <Select value={filterLang} onValueChange={setFilterLang}>
                <SelectTrigger className="font-mono text-[10px] h-7 rounded-none bg-background border-input w-[110px]">
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
                <SelectTrigger className="font-mono text-[10px] h-7 rounded-none bg-background border-input w-[100px]">
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
                  onClick={() => { setFilterLang("all"); setFilterStatus("all"); }}
                  className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            {isLoadingSessions &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full bg-card rounded-none" />
              ))}

            {!isLoadingSessions && sortedSessions.length === 0 && (
              <div className="border border-dashed border-border p-16 text-center rounded-sm">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Terminal className="w-7 h-7 text-primary" />
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

            {completedSessions.map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <div className="group relative border border-border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors rounded-sm">
                  {/* Status stripe */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-sm ${
                      session.status === "done"
                        ? "bg-emerald-500"
                        : session.status === "failed"
                        ? "bg-red-500"
                        : "bg-gray-500"
                    }`}
                  />

                  <div className="flex-1 min-w-0 pl-2">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        ID_{session.id.toString().padStart(4, "0")}
                      </span>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] rounded-none uppercase border shrink-0 ${getStatusStyle(session.status)}`}
                      >
                        {getStatusIcon(session.status)}
                        {session.status}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[9px] rounded-none uppercase border shrink-0 ${getLangColor(session.language)}`}
                      >
                        {session.language}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="font-mono text-[9px] rounded-none uppercase border shrink-0 text-muted-foreground/70 border-border"
                      >
                        <Cpu className="w-2 h-2 mr-0.5" />
                        {session.model}
                      </Badge>
                    </div>
                    <p className="font-sans text-sm text-foreground truncate">{session.task}</p>
                  </div>

                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">
                        Iterations
                      </div>
                      <div className="font-mono text-sm">{session.iterations}</div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">
                        Completed
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {timeAgo(session.updatedAt)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDelete(session.id, e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
