import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type Redis from "ioredis";
import config from "../config";
import { corsOriginCallback } from "../shared/corsOrigin";
import { createRedisConnection } from "../config/redis.config";
import { jwtHelpers } from "../shared/jwt";
import { SessionService } from "../app/modules/auth/session.service";
import { SubjectType } from "../app/modules/auth/auth.constant";
import { logger } from "../shared/logger";
import { rooms } from "./rooms";

export type SocketPrincipal = { kind: "user" | "admin"; id: string; role: string };

let io: Server | null = null;
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

const extractToken = (socket: Socket): string | undefined => {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === "string" && fromAuth) return fromAuth.replace(/^Bearer /, "");
  const header = socket.handshake.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
};

/** Website users connect with a 60s ticket from POST /auth/socket-ticket (their access token is an httpOnly cookie). */
const extractTicket = (socket: Socket): string | undefined => {
  const ticket = socket.handshake.auth?.ticket;
  return typeof ticket === "string" && ticket ? ticket : undefined;
};

/**
 * Credentials are verified at handshake (audit #9). On failure the connection is refused.
 * Client: `io(url, { auth: { ticket } })` (website) or `io(url, { auth: { token, kind: 'admin' } })`
 * (dashboard / Bearer clients) — kind defaults to user if omitted.
 */
const authenticate = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const ticket = extractTicket(socket);
    const token = ticket ? undefined : extractToken(socket);
    if (!ticket && !token) return next(new Error("UNAUTHORIZED"));
    const kind: SubjectType = ticket ? "user" : socket.handshake.auth?.kind === "admin" ? "admin" : "user";

    const claims = ticket ? jwtHelpers.verifySocketTicket(ticket) : jwtHelpers.verifyAccess(kind, token!);
    const [state, revoked] = await Promise.all([
      SessionService.getAuthState(kind, claims.sub),
      SessionService.isRevoked(claims.sid),
    ]);
    const activeStatuses = kind === "user" ? ["active", "deactivation_scheduled"] : ["active"];
    if (!state || revoked || state.tokenVersion !== claims.ver || !activeStatuses.includes(state.status)) {
      return next(new Error("UNAUTHORIZED"));
    }

    socket.data.principal = { kind, id: claims.sub, role: state.role } satisfies SocketPrincipal;
    next();
  } catch {
    next(new Error("UNAUTHORIZED"));
  }
};

const onConnection = (socket: Socket) => {
  const principal = socket.data.principal as SocketPrincipal;

  if (principal.kind === "user") {
    socket.join(rooms.user(principal.id));
  } else {
    socket.join([rooms.admin(principal.id), rooms.admins]);
  }

  // Chat (modules/conversation) pushes `message:new`, `conversation:read` and `chat:unread` to the
  // participants' own `user:<id>` rooms, so no conversation-room join is needed. Clients can never
  // join arbitrary rooms on their own. (Typing indicators, if added later, must check membership first.)

  socket.on("disconnect", (reason) => {
    logger.debug(`socket ${socket.id} (${principal.kind}:${principal.id}) disconnected: ${reason}`);
  });
};

export const initSocket = (httpServer: HttpServer): Server => {
  pubClient = createRedisConnection("socket-pub");
  subClient = pubClient.duplicate();

  io = new Server(httpServer, {
    cors: { origin: corsOriginCallback, credentials: true },
    pingTimeout: 30_000,
    maxHttpBufferSize: 1e5, // messages go via REST; no large payloads needed over the socket
    adapter: createAdapter(pubClient, subClient),
  });

  io.use(authenticate);
  io.on("connection", onConnection);

  logger.info("Socket gateway ready");
  return io;
};

export const getIO = (): Server => {
  if (!io) throw new Error("Socket.io not initialised");
  return io;
};

export const closeSocket = async (): Promise<void> => {
  if (io) {
    await new Promise<void>((resolve) => io!.close(() => resolve()));
    io = null;
  }
  await Promise.all([pubClient?.quit(), subClient?.quit()].filter(Boolean));
  pubClient = subClient = null;
};
