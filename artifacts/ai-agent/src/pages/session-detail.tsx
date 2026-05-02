import React, { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetSession,
  useListSessionFiles,
  useListSessionEvents,
  useListTestResults,
  useGetGitStatus,
  useCancelSession,
  useRerunSession,
  useUpdateFile,
  getGetSessionQueryKey,
  getListSessionFilesQueryKey,
  getListSessionEventsQueryKey,
  getListTestResultsQueryKey,
  getGetGitStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useSSE } from "@/hooks/use-sse";
import {
  Terminal, ArrowLeft, Square, FileCode, CheckCircle2,
  XCircle, GitBranch, Loader2, Activity, RefreshCw, Download,
  Pencil, Save, X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SessionDetail() {
  const [, params] = useRoute("/sessions/:id");
  const sessionId = params?.id ? parseInt(params.id, 10) : undefined;
  const queryClient = useQueryClient();

  const cancelSession = useCancelSession();
  const rerunSession = useRerunSession();
  const updateFile = useUpdateFile();

  const [editingFileId, setEditingFileId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);

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

  const isActive = session?.status && ["pending", "planning", "coding", "testing", "iterating"].includes(session.status);
  const isDone = session?.status === "done";
  const isFailed = session?.status === "failed";
  const isCancelled = session?.status === "cancelled";
  const canRerun = !isActive && (isDone || isFailed || isCancelled);

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
      refetchInterval: isActive ? 2000 : false,
    },
  });

  const { events: sseEvents, isConnected } = useSSE(isActive ? sessionId : undefined);
  const events = isActive ? sseEvents : fallbackEvents;

  const eventsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const selectedFile = files.find((f) => f.id === (selectedFileId ?? files[0]?.id));

  const invalidateAll = () => {
    if (!sessionId) return;
    queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getListSessionFilesQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getListSessionEventsQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getListTestResultsQueryKey(sessionId) });
    queryClient.invalidateQueries({ queryKey: getGetGitStatusQueryKey(sessionId) });
  };

  const handleCancel = () => {
    if (!sessionId) return;
    cancelSession.mutate({ id: sessionId }, { onSuccess: invalidateAll });
  };

  const handleRerun = () => {
    if (!sessionId) return;
    rerunSession.mutate({ id: sessionId }, { onSuccess: invalidateAll });
  };

  const handleStartEdit = (file: { id: number; content: string }) => {
    setEditingFileId(file.id);
    setEditContent(file.content);
  };

  const handleSaveEdit = () => {
    if (!sessionId || editingFileId === null) return;
    updateFile.mutate(
      { id: sessionId, fileId: editingFileId, data: { content: editContent } },
      {
        onSuccess: () => {
          setEditingFileId(null);
          queryClient.invalidateQueries({ queryKey: getListSessionFilesQueryKey(sessionId) });
        },
      }
    );
  };

  const handleDownload = () => {
    if (!sessionId) return;
    window.open(`/api/agent/sessions/${sessionId}/download`, "_blank");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done": return "border-emerald-500/40 text-emerald-400 bg-emerald-500/10";
      case "failed": return "border-red-500/40 text-red-400 bg-red-500/10";
      case "cancelled": return "border-gray-500/40 text-gray-400 bg-gray-500/10";
      case "pending": return "border-amber-500/40 text-amber-400 bg-amber-500/10";
      default: return "border-blue-500/40 text-blue-400 bg-blue-500/10";
    }
  };

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
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-card shrink-0 flex items-center px-4 justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/">
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-none hover:bg-muted shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="h-4 w-[1px] bg-border shrink-0" />
          <div className="font-mono text-sm text-muted-foreground shrink-0">
            ID_{session.id.toString().padStart(4, "0")}
          </div>
          <Badge variant="outline" className={`font-mono text-[10px] rounded-none uppercase border shrink-0 ${getStatusColor(session.status)}`}>
            {session.status}
          </Badge>
          {isConnected && isActive && (
            <Badge variant="outline" className="font-mono text-[10px] rounded-none uppercase border-emerald-500/30 text-emerald-400 bg-emerald-500/10 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
              LIVE
            </Badge>
          )}
          <div className="font-mono text-xs text-muted-foreground truncate hidden md:block max-w-[300px]">
            {session.task}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-xs text-muted-foreground hidden md:block">
            ITER: <span className="text-foreground">{session.iterations}</span>
          </div>

          {files.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="font-mono text-xs h-8 rounded-none border-border hover:border-primary hover:text-primary"
            >
              <Download className="w-3 h-3 mr-1.5" />
              ZIP
            </Button>
          )}

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
              <Square className="w-3 h-3 mr-1.5" />
              ABORT
            </Button>
          )}
        </div>
      </header>

      {/* Three Panel Layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Panel: Files */}
        <div className="w-1/4 min-w-[240px] max-w-[320px] border-r border-border flex flex-col bg-card">
          <div className="h-10 border-b border-border flex items-center px-3 font-mono text-xs text-muted-foreground uppercase bg-background shrink-0">
            <FileCode className="w-3 h-3 mr-2" />
            Workspace
            <span className="ml-auto text-[10px]">{files.length} files</span>
          </div>

          {/* File list */}
          <div className="border-b border-border shrink-0" style={{ maxHeight: "35%" }}>
            <ScrollArea className="h-full">
              <div className="p-2 flex flex-col gap-0.5">
                {files.length === 0 && (
                  <div className="text-center p-4 font-mono text-[10px] text-muted-foreground">
                    NO_FILES_YET
                  </div>
                )}
                {files.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => { setSelectedFileId(file.id); setEditingFileId(null); }}
                    className={`text-left px-2 py-1.5 font-mono text-xs truncate transition-colors flex items-center gap-2 w-full ${
                      selectedFile?.id === file.id
                        ? "bg-primary/10 text-primary border-l-2 border-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent"
                    }`}
                  >
                    <FileCode className="w-3 h-3 shrink-0 opacity-50" />
                    <span className="truncate">{file.name}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* File viewer / editor */}
          <div className="flex-1 bg-background overflow-hidden flex flex-col">
            {selectedFile ? (
              <>
                <div className="h-8 shrink-0 bg-muted/20 border-b border-border flex items-center px-3 font-mono text-[10px] text-muted-foreground justify-between gap-2">
                  <span className="truncate">{selectedFile.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-muted-foreground/50">{selectedFile.language}</span>
                    {editingFileId === selectedFile.id ? (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          disabled={updateFile.isPending}
                          className="ml-1 p-0.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                          title="Save changes"
                        >
                          <Save className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingFileId(null)}
                          className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                          title="Cancel edit"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(selectedFile)}
                        className="ml-1 p-0.5 text-muted-foreground hover:text-primary transition-colors"
                        title="Edit file"
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

        {/* Center Panel: Event Log */}
        <div className="flex-1 border-r border-border flex flex-col bg-background min-w-0">
          <div className="h-10 border-b border-border flex items-center px-3 font-mono text-xs text-muted-foreground uppercase bg-card shrink-0">
            <Activity className="w-3 h-3 mr-2" />
            Execution Stream
            <span className="ml-auto text-[10px]">{events.length} events</span>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-4">
              {events.length === 0 && (
                <div className="text-center p-8 font-mono text-xs text-muted-foreground">
                  {isActive ? "INITIALIZING..." : "NO_EVENTS"}
                </div>
              )}
              {events.map((event) => (
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
                      <span className={`font-mono text-[10px] uppercase font-bold
                        ${event.type === "error" ? "text-red-400" : ""}
                        ${event.type === "success" ? "text-emerald-400" : ""}
                        ${event.type === "code" ? "text-amber-400" : ""}
                        ${event.type === "plan" ? "text-violet-400" : ""}
                        ${event.type === "thought" ? "text-blue-400" : ""}
                        ${["test", "git"].includes(event.type) ? "text-muted-foreground" : ""}
                      `}>
                        [{event.type}]
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/50">
                        {format(new Date(event.createdAt), "HH:mm:ss")}
                      </span>
                      {event.iteration > 0 && (
                        <span className="font-mono text-[9px] text-muted-foreground/40 border border-border px-1">
                          IT:{event.iteration}
                        </span>
                      )}
                    </div>
                    <div className={`font-mono text-[11px] whitespace-pre-wrap break-words leading-relaxed ${
                      event.type === "error"
                        ? "text-red-400/90 bg-red-500/10 p-2 border border-red-500/20"
                        : event.type === "success"
                        ? "text-emerald-400/90 bg-emerald-500/10 p-2 border border-emerald-500/20"
                        : event.type === "code"
                        ? "text-foreground/80 bg-muted/30 p-2 border border-border"
                        : "text-foreground/75"
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

        {/* Right Panel: Tests + Git */}
        <div className="w-[280px] shrink-0 flex flex-col bg-card">
          <Tabs defaultValue="tests" className="flex-1 flex flex-col overflow-hidden">
            <div className="h-10 border-b border-border bg-background px-2 flex items-center shrink-0">
              <TabsList className="bg-transparent h-8 p-0 gap-4">
                <TabsTrigger
                  value="tests"
                  className="font-mono text-[10px] uppercase data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-2 h-full"
                >
                  Telemetry
                </TabsTrigger>
                <TabsTrigger
                  value="git"
                  className="font-mono text-[10px] uppercase data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-2 h-full"
                >
                  VCS
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <TabsContent value="tests" className="absolute inset-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-3 flex flex-col gap-3">
                    {testResults.length === 0 && (
                      <div className="text-center p-6 font-mono text-[10px] text-muted-foreground">
                        NO_TEST_DATA
                      </div>
                    )}
                    {testResults.map((test) => (
                      <div key={test.id} className="border border-border bg-background flex flex-col">
                        <div className={`h-8 px-2 flex items-center gap-2 border-b border-border ${test.passed ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                          {test.passed ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-500" />
                          )}
                          <span className="font-mono text-[10px] uppercase font-bold">
                            Iteration {test.iteration}
                          </span>
                          <span className="font-mono text-[9px] text-muted-foreground ml-auto">
                            {format(new Date(test.createdAt), "HH:mm:ss")}
                          </span>
                        </div>
                        <div className="p-2 font-mono text-[10px] whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">
                          {test.output && (
                            <div className="text-muted-foreground">{test.output.slice(0, 400)}</div>
                          )}
                          {test.errors && (
                            <div className="text-red-400 mt-1 bg-red-500/10 p-1 border border-red-500/20">
                              {test.errors.slice(0, 300)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="git" className="absolute inset-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-3">
                    {!gitStatus ? (
                      <div className="text-center p-6 font-mono text-[10px] text-muted-foreground">
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

                        {(gitStatus.staged?.length > 0) && (
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase mb-1">
                              Staged ({gitStatus.staged.length})
                            </div>
                            {gitStatus.staged.map((f) => (
                              <div key={f} className="text-emerald-400 mb-0.5 truncate pl-2 border-l border-emerald-500/30 text-[10px]">
                                A {f}
                              </div>
                            ))}
                          </div>
                        )}

                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase mb-1">
                            Modified ({gitStatus.modified?.length || 0})
                          </div>
                          {gitStatus.modified?.length === 0 && (
                            <div className="text-[10px] text-muted-foreground/50 pl-2">clean</div>
                          )}
                          {gitStatus.modified?.map((f) => (
                            <div key={f} className="text-amber-400 mb-0.5 truncate pl-2 border-l border-amber-500/30 text-[10px]">
                              M {f}
                            </div>
                          ))}
                        </div>

                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase mb-1">
                            Untracked ({gitStatus.untracked?.length || 0})
                          </div>
                          {gitStatus.untracked?.map((f) => (
                            <div key={f} className="text-muted-foreground mb-0.5 truncate pl-2 border-l border-muted-foreground/30 text-[10px]">
                              ? {f}
                            </div>
                          ))}
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
