import { useEffect, useState } from "react";
import type { AgentEvent } from "@workspace/api-client-react/src/generated/api.schemas";

export function useSSE(sessionId: number | undefined) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    setEvents([]);
    const eventSource = new EventSource(`/api/agent/sessions/${sessionId}/stream`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        // Only add actual agent events (they have an id and createdAt)
        if (
          parsed &&
          typeof parsed.id === "number" &&
          parsed.createdAt &&
          parsed.type &&
          !["status", "complete", "error"].includes(parsed.type === "status" || parsed.type === "complete" ? parsed.type : "")
        ) {
          const agentEvent = parsed as AgentEvent;
          setEvents((prev) => {
            if (prev.some((e) => e.id === agentEvent.id)) return prev;
            return [...prev, agentEvent].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          });
        }
      } catch (e) {
        console.error("Failed to parse SSE event", e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [sessionId]);

  return { events, isConnected };
}
