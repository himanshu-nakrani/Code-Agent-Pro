import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListSessions,
  useGetAgentStats,
  useCreateSession,
  useDeleteSession,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Terminal, Activity, FileCode, Play, Trash2, Plus, Zap, Check, X, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const TASK_TEMPLATES: { label: string; task: string; language: "python" | "javascript" | "typescript" }[] = [
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
    label: "Markdown to HTML",
    task: "Build a Markdown to HTML converter that handles headings, bold, italic, code blocks, and links. Include test cases.",
    language: "typescript",
  },
  {
    label: "Web Scraper",
    task: "Write a Python script that fetches and parses HTML from a URL using requests and beautifulsoup4, extracts all links and headings, and prints a structured report.",
    language: "python",
  },
];

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: sessions, isLoading: isLoadingSessions, refetch: refetchSessions } = useListSessions();
  const { data: stats, isLoading: isLoadingStats } = useGetAgentStats();

  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newLang, setNewLang] = useState<"python" | "javascript" | "typescript">("python");

  const handleCreate = () => {
    if (!newTask.trim()) return;
    createSession.mutate(
      { data: { task: newTask, language: newLang } },
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

  const applyTemplate = (t: typeof TASK_TEMPLATES[number]) => {
    setNewTask(t.task);
    setNewLang(t.language);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "failed": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "cancelled": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "pending": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done": return <Check className="w-3 h-3 mr-1" />;
      case "failed": return <X className="w-3 h-3 mr-1" />;
      case "cancelled": return <X className="w-3 h-3 mr-1" />;
      case "pending": return <Clock className="w-3 h-3 mr-1" />;
      default: return <Activity className="w-3 h-3 mr-1 animate-pulse" />;
    }
  };

  const activeSessions = sessions?.filter(s =>
    ["pending", "planning", "coding", "testing", "iterating"].includes(s.status)
  ) || [];
  const completedSessions = sessions?.filter(s =>
    ["done", "failed", "cancelled"].includes(s.status)
  ) || [];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
              <Terminal className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight font-mono">FORGE</h1>
            {activeSessions.length > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] rounded-none border-blue-500/30 text-blue-400 bg-blue-500/10 ml-2">
                <Activity className="w-2.5 h-2.5 mr-1 animate-pulse" />
                {activeSessions.length} RUNNING
              </Badge>
            )}
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) setNewTask(""); }}>
            <DialogTrigger asChild>
              <Button variant="default" className="font-mono text-sm gap-2">
                <Plus className="w-4 h-4" />
                NEW SESSION
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] border-border bg-card">
              <DialogHeader>
                <DialogTitle className="font-mono text-base uppercase">Initialize New Agent</DialogTitle>
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
                        className={`text-left px-2 py-1.5 border font-mono text-[10px] transition-colors hover:border-primary hover:text-primary hover:bg-primary/5 ${
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
                  <Label htmlFor="task" className="font-mono text-xs text-muted-foreground uppercase">
                    Task Directive
                  </Label>
                  <textarea
                    id="task"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    placeholder="Describe what you want the agent to build..."
                    className="font-mono text-sm bg-background border border-input rounded-none p-3 resize-none focus:outline-none focus:border-primary transition-colors min-h-[80px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCreate();
                    }}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="language" className="font-mono text-xs text-muted-foreground uppercase">
                    Runtime
                  </Label>
                  <Select value={newLang} onValueChange={(val: any) => setNewLang(val)}>
                    <SelectTrigger className="font-mono bg-background border-input rounded-none">
                      <SelectValue placeholder="Select runtime" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="python">Python 3</SelectItem>
                      <SelectItem value="javascript">Node.js / JavaScript</SelectItem>
                      <SelectItem value="typescript">TypeScript</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={!newTask.trim() || createSession.isPending}
                  className="font-mono w-full gap-2"
                >
                  <Zap className="w-4 h-4" />
                  {createSession.isPending ? "INITIALIZING..." : "EXECUTE DIRECTIVE"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 flex flex-col gap-8">

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Sessions", icon: Activity, value: stats?.totalSessions ?? 0, format: (v: number) => v },
            { label: "Success Rate", icon: Check, value: stats?.successRate ?? 0, format: (v: number) => `${v.toFixed(1)}%` },
            { label: "Avg Iterations", icon: Play, value: stats?.avgIterations ?? 0, format: (v: number) => v.toFixed(1) },
            { label: "Files Generated", icon: FileCode, value: stats?.totalFilesGenerated ?? 0, format: (v: number) => v },
          ].map(({ label, icon: Icon, value, format: fmt }) => (
            <Card key={label} className="bg-card border-border rounded-none shadow-none">
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
              Running
            </h2>
            <div className="grid gap-2">
              {activeSessions.map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <div className="group border border-blue-500/20 bg-blue-500/5 p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-blue-500/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">ID_{session.id.toString().padStart(4, "0")}</span>
                        <Badge variant="outline" className={`font-mono text-[10px] rounded-none uppercase border ${getStatusColor(session.status)}`}>
                          {getStatusIcon(session.status)}
                          {session.status}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground/60">{session.language}</span>
                      </div>
                      <p className="font-sans text-sm text-foreground truncate">{session.task}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Sessions */}
        <div>
          <h2 className="text-xs font-mono font-bold uppercase mb-3 text-muted-foreground">
            Active &amp; Recent Directives
          </h2>

          <div className="grid gap-2">
            {isLoadingSessions &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full bg-card rounded-none" />
              ))}

            {!isLoadingSessions && sessions?.length === 0 && (
              <div className="border border-dashed border-border p-12 text-center font-mono text-sm text-muted-foreground">
                NO SESSIONS FOUND. INITIALIZE A NEW AGENT TO BEGIN.
              </div>
            )}

            {sessions?.map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <div className="group relative border border-border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:border-primary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        ID_{session.id.toString().padStart(4, "0")}
                      </span>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] rounded-none uppercase border shrink-0 ${getStatusColor(session.status)}`}
                      >
                        {getStatusIcon(session.status)}
                        {session.status}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0">
                        {session.language}
                      </span>
                    </div>
                    <p className="font-sans text-sm text-foreground truncate">{session.task}</p>
                  </div>

                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">Iterations</div>
                      <div className="font-mono text-sm">{session.iterations}</div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">Started</div>
                      <div className="font-mono text-sm">{format(new Date(session.createdAt), "MMM d, HH:mm")}</div>
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
