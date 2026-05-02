import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListSessions, 
  useGetAgentStats, 
  useCreateSession, 
  useDeleteSession 
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Terminal, Activity, FileCode, Play, Trash2, Plus, Zap, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: sessions, isLoading: isLoadingSessions, refetch: refetchSessions } = useListSessions();
  const { data: stats, isLoading: isLoadingStats } = useGetAgentStats();
  
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newLang, setNewLang] = useState<"python"|"javascript"|"typescript">("python");

  const handleCreate = () => {
    if (!newTask.trim()) return;
    createSession.mutate({ data: { task: newTask, language: newLang } }, {
      onSuccess: (res) => {
        setIsDialogOpen(false);
        setLocation(`/sessions/${res.id}`);
      }
    });
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this session?")) {
      deleteSession.mutate({ id }, {
        onSuccess: () => refetchSessions()
      });
    }
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
              <Terminal className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight font-mono">FORGE</h1>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" className="font-mono text-sm gap-2">
                <Plus className="w-4 h-4" />
                NEW SESSION
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] border-border bg-card">
              <DialogHeader>
                <DialogTitle className="font-mono text-lg uppercase">Initialize New Agent</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="task" className="font-mono text-xs text-muted-foreground uppercase">Task Directive</Label>
                  <Input 
                    id="task" 
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    placeholder="e.g. Build a script to parse access logs..."
                    className="font-mono bg-background border-input"
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="language" className="font-mono text-xs text-muted-foreground uppercase">Runtime Environment</Label>
                  <Select value={newLang} onValueChange={(val: any) => setNewLang(val)}>
                    <SelectTrigger className="font-mono bg-background border-input">
                      <SelectValue placeholder="Select runtime" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="python">Python 3</SelectItem>
                      <SelectItem value="javascript">Node.js</SelectItem>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border rounded-none shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-2">
                <Activity className="w-3 h-3" />
                Total Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16 bg-muted" /> : (
                <div className="text-3xl font-mono font-bold text-primary">{stats?.totalSessions || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card border-border rounded-none shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-2">
                <Check className="w-3 h-3" />
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16 bg-muted" /> : (
                <div className="text-3xl font-mono font-bold text-foreground">{(stats?.successRate || 0).toFixed(1)}%</div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card border-border rounded-none shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-2">
                <Play className="w-3 h-3" />
                Avg Iterations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16 bg-muted" /> : (
                <div className="text-3xl font-mono font-bold text-foreground">{(stats?.avgIterations || 0).toFixed(1)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card border-border rounded-none shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-2">
                <FileCode className="w-3 h-3" />
                Files Generated
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? <Skeleton className="h-8 w-16 bg-muted" /> : (
                <div className="text-3xl font-mono font-bold text-foreground">{stats?.totalFilesGenerated || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sessions List */}
        <div>
          <h2 className="text-lg font-mono font-bold uppercase mb-4 text-muted-foreground">Active & Recent Directives</h2>
          
          <div className="grid gap-3">
            {isLoadingSessions && (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full bg-card rounded-none" />
              ))
            )}
            
            {!isLoadingSessions && sessions?.length === 0 && (
              <div className="border border-dashed border-border p-12 text-center text-muted-foreground font-mono text-sm">
                NO SESSIONS FOUND. INITIALIZE A NEW AGENT TO BEGIN.
              </div>
            )}

            {sessions?.map(session => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <div className="group relative border border-border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-primary/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-xs text-muted-foreground">ID_{session.id.toString().padStart(4, '0')}</span>
                      <Badge variant="outline" className={`font-mono text-[10px] rounded-none uppercase border ${getStatusColor(session.status)}`}>
                        {getStatusIcon(session.status)}
                        {session.status}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{session.language}</span>
                    </div>
                    <p className="font-sans text-sm text-foreground truncate">
                      {session.task}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-6 shrink-0">
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
