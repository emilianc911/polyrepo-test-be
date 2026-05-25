import type { IncomingMessage, Server as HttpServer } from "node:http";
import { URL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { verifyToken } from "../auth/jwt.js";
import { logger } from "../logger.js";
import { pubClient, subClient } from "../redis.js";

const CHANNEL = "polyrepo.events";

export interface WsEvent {
  type: string;
  projectId: string;
  payload: unknown;
}

// Sockets are stored in a map keyed by the user id, with the set of project
// ids they currently subscribe to. The Redis subscriber is what decides which
// sockets receive a given event (all of them, filtered by project id).
type ClientState = {
  ws: WebSocket;
  userId: string;
  subscribedProjects: Set<string>;
};

const clients = new Set<ClientState>();

function authenticate(req: IncomingMessage): { userId: string; email: string } | null {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const token =
      url.searchParams.get("token") ??
      req.headers.authorization?.replace(/^Bearer /i, "");
    if (!token) return null;
    const payload = verifyToken(token);
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

function safeSend(ws: WebSocket, msg: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "ws send failed");
  }
}

export function attachWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const auth = authenticate(req);
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, auth);
    });
  });

  wss.on(
    "connection",
    (ws: WebSocket, _req: IncomingMessage, auth: { userId: string }) => {
      const state: ClientState = {
        ws,
        userId: auth.userId,
        subscribedProjects: new Set(),
      };
      clients.add(state);
      logger.info({ userId: auth.userId, total: clients.size }, "ws connected");
      safeSend(ws, { type: "hello", userId: auth.userId });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg && typeof msg === "object" && msg.type === "subscribe" && msg.projectId) {
            state.subscribedProjects.add(String(msg.projectId));
            safeSend(ws, { type: "subscribed", projectId: msg.projectId });
          } else if (
            msg && typeof msg === "object" && msg.type === "unsubscribe" && msg.projectId
          ) {
            state.subscribedProjects.delete(String(msg.projectId));
          }
        } catch {
          // ignore malformed frames
        }
      });

      ws.on("close", () => {
        clients.delete(state);
        logger.info({ userId: auth.userId, total: clients.size }, "ws disconnected");
      });
    },
  );

  // Single Redis subscriber fan-out to all interested local sockets.
  subClient.subscribe(CHANNEL).catch((err: Error) => {
    logger.error({ err: err.message }, "redis subscribe failed");
  });
  subClient.on("message", (channel: string, raw: string) => {
    if (channel !== CHANNEL) return;
    let event: WsEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    for (const c of clients) {
      if (!c.subscribedProjects.has(event.projectId)) continue;
      safeSend(c.ws, event);
    }
  });

  return wss;
}

export async function publishEvent(event: WsEvent): Promise<void> {
  await pubClient.publish(CHANNEL, JSON.stringify(event));
}
