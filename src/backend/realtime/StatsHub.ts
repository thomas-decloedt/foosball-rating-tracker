interface DurableObjectState {
  acceptWebSocket(webSocket: WebSocket): void;
}

interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

declare const WebSocketPair: {
  prototype: WebSocketPair;
  new (): WebSocketPair;
};

type StatsHubEvent = {
  type: "match-updated";
  players: string[];
  seasons: string[];
  leaderboards: string[];
};

type ClientMessage =
  | {
      type: "subscribe";
      topics: string[];
    }
  | {
      type: "unsubscribe";
      topics: string[];
    };

interface WebSocketWithMeta extends WebSocket {
  topics?: Set<string>;
}

interface WebSocketResponseInit extends ResponseInit {
  webSocket: WebSocket;
}

export class StatsHub {
  private sockets: Set<WebSocketWithMeta> = new Set();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade") || "";

    if (upgradeHeader.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      const serverWithMeta = server as WebSocketWithMeta;
      serverWithMeta.topics = new Set<string>();

      this.state.acceptWebSocket(serverWithMeta);
      this.sockets.add(serverWithMeta);

      return new Response(
        null,
        {
          status: 101,
          webSocket: client,
        } as WebSocketResponseInit,
      );
    }

    if (request.method === "POST") {
      const event = (await request.json()) as StatsHubEvent;
      this.broadcastEvent(event);
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const socket = ws as WebSocketWithMeta;

    if (typeof message !== "string") {
      return;
    }

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    if (!socket.topics) {
      socket.topics = new Set<string>();
    }

    if (parsed.type === "subscribe") {
      for (const topic of parsed.topics) {
        socket.topics.add(topic);
      }
    } else if (parsed.type === "unsubscribe") {
      for (const topic of parsed.topics) {
        socket.topics.delete(topic);
      }
    }
  }

  webSocketClose(ws: WebSocket): void {
    const socket = ws as WebSocketWithMeta;
    this.sockets.delete(socket);
  }

  private broadcastEvent(event: StatsHubEvent): void {
    const payload = JSON.stringify(event);

    const playerTopics = new Set(event.players.map((id) => `player:${id}`));
    const seasonTopics = new Set(event.seasons.map((id) => `season:${id}`));
    const leaderboardTopics = new Set(
      event.leaderboards.map((id) => `leaderboard:${id}`),
    );

    for (const socket of this.sockets) {
      if (!socket.topics || socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      const topics = socket.topics;
      const shouldSend =
        Array.from(playerTopics).some((t) => topics.has(t)) ||
        Array.from(seasonTopics).some((t) => topics.has(t)) ||
        Array.from(leaderboardTopics).some((t) => topics.has(t));

      if (shouldSend) {
        try {
          socket.send(payload);
        } catch {
          this.sockets.delete(socket);
        }
      }
    }
  }
}
