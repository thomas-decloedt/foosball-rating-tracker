import { useEffect, useRef } from "react";
import { useAuth } from "@/frontend/contexts/auth-context";

type StatsHubEvent = {
  type: "match-updated";
  players: string[];
  seasons: string[];
  leaderboards: string[];
};

type RealtimeOptions = {
  topics: string[];
  onEvent?: (event: StatsHubEvent) => void;
};

export function useRealtime({ topics, onEvent }: RealtimeOptions): void {
  const { user } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  const topicsRef = useRef<string[]>(topics);
  const onEventRef = useRef<typeof onEvent>(onEvent);

  useEffect(() => {
    topicsRef.current = topics;
  }, [topics]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/api/v1/realtime`;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      if (topicsRef.current.length > 0) {
        socket.send(
          JSON.stringify({
            type: "subscribe",
            topics: topicsRef.current,
          }),
        );
      }
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as StatsHubEvent;
        if (onEventRef.current) {
          onEventRef.current(parsed);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    socket.onerror = () => {
      // Best effort; no reconnection logic for now
    };

    socket.onclose = () => {
      socketRef.current = null;
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [user]);
}
