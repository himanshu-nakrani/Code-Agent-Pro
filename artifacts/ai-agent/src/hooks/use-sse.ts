import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@workspace/api-client-react";

export type SSEStatusEvent = {
  type: "status";
  content: string;
};

export type SSEOptions = {
  onStatusChange?: (status: string) => void;
  onComplete?: (finalStatus: string) => void;
};

export function useSSE(sessionId: number | undefined, options?: SSEOptions) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      setIsConnected(false);
      return;
    }

    setEvents([]);
    let retryCount = 0;
    let closed = false;
    let es: EventSource | null = null;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/api/agent/sessions/${sessionId}/stream`);

      es.onopen = () => {
        setIsConnected(true);
        retryCount = 0;
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (!parsed) return;

          if (parsed.type === "status" && typeof parsed.content === "string") {
            optionsRef.current?.onStatusChange?.(parsed.content);
            return;
          }

          if (parsed.type === "complete" && typeof parsed.content === "string") {
            optionsRef.current?.onComplete?.(parsed.content);
            return;
          }

          if (
            typeof parsed.id === "number" &&
            parsed.createdAt &&
            typeof parsed.type === "string" &&
            typeof parsed.content === "string"
          ) {
            const agentEvent = parsed as AgentEvent;
            setEvents((prev) => {
              if (prev.some((e) => e.id === agentEvent.id)) return prev;
              return [...prev, agentEvent].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              );
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es?.close();
        if (!closed) {
          const delay = Math.min(1000 * Math.pow(1.5, retryCount), 8000);
          retryCount++;
          setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      es?.close();
      setIsConnected(false);
    };
  }, [sessionId]);

  return { events, isConnected };
}
