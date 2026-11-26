import { Emitter } from "@socket.io/redis-emitter";
import { createRedisConnection } from "../config/redis.config";
import { rooms } from "./rooms";

/**
 * Redis emitter — works from both the api and worker processes (the worker has no socket server).
 * Never `io.emit()` (to everyone) — every emit targets a room (audit #8).
 */
let emitter: Emitter | null = null;

const getEmitter = (): Emitter => {
  if (!emitter) emitter = new Emitter(createRedisConnection("socket-emitter"));
  return emitter;
};

export const socketEmit = {
  toUser: (userId: string, event: string, payload: unknown) =>
    getEmitter().to(rooms.user(userId)).emit(event, payload),

  toAdmin: (adminId: string, event: string, payload: unknown) =>
    getEmitter().to(rooms.admin(adminId)).emit(event, payload),

  toAdmins: (event: string, payload: unknown) => getEmitter().to(rooms.admins).emit(event, payload),

  toConversation: (conversationId: string, event: string, payload: unknown) =>
    getEmitter().to(rooms.conversation(conversationId)).emit(event, payload),
};
