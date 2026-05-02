import React, { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { 
  useGetSession, 
  useListSessionFiles, 
  useListSessionEvents, 
  useListTestResults,
  useGetGitStatus,
  useCancelSession,
  getGetSessionQueryKey,
  getListSessionFilesQueryKey,
  getListSessionEventsQueryKey,
  getListTestResultsQueryKey,
  getGetGitStatusQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useSSE } from "@/hooks/use-sse";
import { 
  Terminal, ArrowLeft, Play, Square, FileCode, CheckCircle2, 
  XCircle, GitBranch, Clock, AlertCircle, Loader2, RefreshCw, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export default function SessionDetail() {
  const [, params] = useRoute("/sessions/:id");
  const sessionId = params?.id ? parseInt(params.id, 10) : undefined;
  const queryClient = useQueryClient();

  const cancelSession = useCancelSession();

  // Queries
  const { data: session, isLoading: isLoadingSession } = useGetSession(sessionId!, { 
    query: { 
      enabled: !!sessionId,
      queryKey: getGetSessionQueryKey(sessionId!),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status && ["pending", "planning", "coding", "testing", "iterating"].includes(status) ? 2000 : false;
      }
    } 
  });

  const isActive = session?.status && ["pending", "planning", "coding", "testing", "iterating"].includes(session.status);

  const { data: files = [] } = useListSessionFiles(sessionId!, { 
    query: { 
      enabled: !!sessionId,
      queryKey: getListSessionFilesQueryKey(sessionId!),
      refetchInterval: isActive ? 2000 : false
    } 
  });

  const { data: fallbackEvents = [] } = useListSessionEvents(sessionId!, { 
    query: { 
      enabled: !!sessionId && !isActive, // Only use fallback polling if not active (SSE handles active)
      queryKey: getListSessionEventsQueryKey(sessionId!)
    } 
  });

  const { data: testResults = [] } = useListTestResults(sessionId!, { 
    query: { 
      enabled: !!sessionId,
      queryKey: getListTestResultsQueryKey(sessionId!),
      refetchInterval: isActive ? 2000 : false
    } 
  });

  const { data: gitStatus } = useGetGitStatus(sessionId!, { 
    query: { 
      enabled: !!sessionId,
      queryKey: getGetGitStatusQueryKey(sessionId!),
      refetchInterval: isActive ? 2000 : false
    } 
  });

  // SSE for real-time events
  const { events: sseEvents, isConnected } = useSSE(isActive ? sessionId : undefined);
  const events = isActive ? sseEvents : fallbackEvents;

  // Auto-scroll events
  const eventsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const selectedFile = files.find(f => f.id === selectedFileId) || files[0];

  const handleCancel = () => {
    if (!sessionId) return;
    cancelSession.mutate({ id: sessionId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      }
    });
  };

  if (isLoadingSession) {
    return <div className="h-screen w-full flex items-center justify-center bg-background text-primary"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!session) {
    return <div className="p-8 font-mono text-destructive">SESSION_NOT_FOUND</div>;
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-card shrink-0 flex items-center px-4 justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-none hover:bg-muted">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="h-4 w-[1px] bg-border" />
          <div className="font-mono text-sm text-muted-foreground">
            ID_{session.id.toString().padStart(4, '0')}
          </div>
          <Badge variant="outline" className={`font-mono text-[10px] rounded-none uppercase border`}>
            {session.status}
          </Badge>
          {isConnected && isActive && (
            <Badge variant="outline" className="font-mono text-[10px] rounded-none uppercase border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" /> LIVE
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="font-mono text-xs text-muted-foreground hidden md:block">
            ITERATION: <span className="text-foreground">{session.iterations}</span>
          </div>
          {isActive && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleCancel}
              disabled={cancelSession.isPending}
              className="font-mono text-xs h-8 rounded-none"
            >
              <Square className="w-3 h-3 mr-2" />
              ABORT
            </Button>
          )}
        </div>
      </header>

      {/* Task Banner */}
      <div className="bg-muted/30 border-b border-border p-4 shrink-0">
        <div className="font-mono text-[10px] text-primary uppercase mb-1 flex items-center gap-2">
          <Terminal className="w-3 h-3" />
          Directive
        </div>
        <div className="font-sans text-sm">
          {session.task}
        </div>
      </div>

      {/* Three Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Files */}
        <div className="w-1/4 min-w-[250px] border-r border-border flex flex-col bg-card">
          <div className="h-10 border-b border-border flex items-center px-3 font-mono text-xs text-muted-foreground uppercase bg-background">
            <FileCode className="w-3 h-3 mr-2" />
            Workspace
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="h-1/3 border-b border-border">
              <div className="p-2 flex flex-col gap-1">
                {files.length === 0 && (
                  <div className="text-center p-4 font-mono text-[10px] text-muted-foreground">
                    NO_FILES_GENERATED
                  </div>
                )}
                {files.map(file => (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    className={`text-left px-2 py-1.5 font-mono text-xs truncate transition-colors flex items-center gap-2 ${
                      (selectedFileId === file.id || (!selectedFileId && selectedFile?.id === file.id))
                        ? "bg-primary/10 text-primary border-l-2 border-primary" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent"
                    }`}
                  >
                    <FileCode className="w-3 h-3 shrink-0 opacity-50" />
                    {file.name}
                  </button>
                ))}
              </div>
            </ScrollArea>
            <div className="flex-1 bg-background relative overflow-hidden flex flex-col">
              {selectedFile ? (
                <>
                  <div className="h-8 shrink-0 bg-muted/20 border-b border-border flex items-center px-3 font-mono text-[10px] text-muted-foreground justify-between">
                    <span>{selectedFile.name}</span>
                    <span>{selectedFile.language}</span>
                  </div>
                  <ScrollArea className="flex-1">
                    <pre className="p-4 text-[11px] font-mono leading-relaxed text-foreground/90 w-full overflow-x-auto">
                      <code>{selectedFile.content}</code>
                    </pre>
                  </ScrollArea>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-muted-foreground">
                  SELECT_FILE
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center Panel: Timeline / Event Log */}
        <div className="flex-1 border-r border-border flex flex-col bg-background min-w-[300px]">
          <div className="h-10 border-b border-border flex items-center px-3 font-mono text-xs text-muted-foreground uppercase bg-card">
            <Activity className="w-3 h-3 mr-2" />
            Execution Stream
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-4">
              {events.length === 0 && (
                <div className="text-center p-8 font-mono text-xs text-muted-foreground">
                  AWAITING_TELEMETRY...
                </div>
              )}
              {events.map((event, i) => (
                <div key={event.id} className="flex gap-3 group">
                  <div className="shrink-0 pt-0.5">
                    {event.type === 'thought' && <div className="w-2 h-2 rounded-full bg-blue-500/50 mt-1" />}
                    {event.type === 'plan' && <div className="w-2 h-2 rounded-full bg-purple-500/50 mt-1" />}
                    {event.type === 'code' && <div className="w-2 h-2 rounded-full bg-primary/50 mt-1" />}
                    {event.type === 'test' && <div className="w-2 h-2 rounded-full bg-amber-500/50 mt-1" />}
                    {event.type === 'error' && <div className="w-2 h-2 rounded-full bg-destructive mt-1" />}
                    {event.type === 'success' && <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1" />}
                    {event.type === 'git' && <div className="w-2 h-2 rounded-full bg-gray-500 mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-mono text-[10px] uppercase font-bold
                        ${event.type === 'error' ? 'text-destructive' : ''}
                        ${event.type === 'success' ? 'text-emerald-500' : ''}
                        ${event.type === 'code' ? 'text-primary' : ''}
                        ${['thought','plan','test','git'].includes(event.type) ? 'text-muted-foreground' : ''}
                      `}>
                        [{event.type}]
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/50">
                        {format(new Date(event.createdAt), "HH:mm:ss")}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/50 border border-border px-1 rounded-sm">
                        IT:{event.iteration}
                      </span>
                    </div>
                    <div className={`font-mono text-xs whitespace-pre-wrap break-words leading-relaxed ${
                      event.type === 'error' ? 'text-destructive/90 bg-destructive/10 p-2 border border-destructive/20 mt-1' :
                      event.type === 'code' ? 'text-foreground/90 bg-muted/30 p-2 border border-border mt-1' :
                      'text-foreground/80'
                    }`}>
                      {event.content}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel: State & Tests */}
        <div className="w-[300px] shrink-0 flex flex-col bg-card">
          <Tabs defaultValue="tests" className="flex-1 flex flex-col">
            <div className="h-10 border-b border-border bg-background px-2 flex items-center">
              <TabsList className="bg-transparent h-8 p-0 gap-4">
                <TabsTrigger value="tests" className="font-mono text-[10px] uppercase data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-2 h-full">
                  Telemetry
                </TabsTrigger>
                <TabsTrigger value="git" className="font-mono text-[10px] uppercase data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-2 h-full">
                  VCS State
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 overflow-hidden relative">
              <TabsContent value="tests" className="absolute inset-0 m-0 data-[state=active]:flex flex-col">
                <ScrollArea className="flex-1">
                  <div className="p-3 flex flex-col gap-3">
                    {testResults.length === 0 && (
                      <div className="text-center p-4 font-mono text-[10px] text-muted-foreground">
                        NO_TEST_DATA
                      </div>
                    )}
                    {testResults.map(test => (
                      <div key={test.id} className="border border-border bg-background flex flex-col">
                        <div className={`h-8 px-2 flex items-center gap-2 border-b border-border ${test.passed ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
                          {test.passed ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-destructive" />}
                          <span className="font-mono text-[10px] uppercase font-bold text-foreground">Iteration {test.iteration}</span>
                          <span className="font-mono text-[9px] text-muted-foreground ml-auto">{format(new Date(test.createdAt), "HH:mm:ss")}</span>
                        </div>
                        <div className="p-2 font-mono text-[10px] whitespace-pre-wrap overflow-hidden">
                          {test.output && <div className="text-muted-foreground">{test.output}</div>}
                          {test.errors && <div className="text-destructive mt-1 bg-destructive/10 p-1 border border-destructive/20">{test.errors}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="git" className="absolute inset-0 m-0 data-[state=active]:flex flex-col">
                <ScrollArea className="flex-1">
                  <div className="p-3">
                    {!gitStatus ? (
                      <div className="text-center p-4 font-mono text-[10px] text-muted-foreground">
                        VCS_UNAVAILABLE
                      </div>
                    ) : (
                      <div className="font-mono text-xs flex flex-col gap-4">
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase mb-1">Branch</div>
                          <div className="flex items-center gap-2 text-primary bg-primary/10 px-2 py-1 border border-primary/20">
                            <GitBranch className="w-3 h-3" />
                            {gitStatus.branch}
                          </div>
                        </div>
                        
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase mb-1">Modified ({gitStatus.modified?.length || 0})</div>
                          {gitStatus.modified?.map(f => <div key={f} className="text-amber-500 mb-0.5 truncate pl-2 border-l border-amber-500/30">M {f}</div>)}
                        </div>

                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase mb-1">Untracked ({gitStatus.untracked?.length || 0})</div>
                          {gitStatus.untracked?.map(f => <div key={f} className="text-muted-foreground mb-0.5 truncate pl-2 border-l border-muted-foreground/30">? {f}</div>)}
                        </div>
                      </div>
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
