import { useEffect, useState } from "react";
import type { AgentEvent } from "@workspace/api-client-react/src/generated/api.schemas";

export function useSSE(sessionId: number | undefined) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    setEvents([]); // Reset events when session changes
    const eventSource = new EventSource(`/api/agent/sessions/${sessionId}/stream`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsedEvent = JSON.parse(event.data) as AgentEvent;
        setEvents((prev) => {
          // Avoid duplicates if we receive them
          if (prev.some((e) => e.id === parsedEvent.id)) return prev;
          return [...prev, parsedEvent].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });
      } catch (e) {
        console.error("Failed to parse SSE event", e);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error", error);
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
