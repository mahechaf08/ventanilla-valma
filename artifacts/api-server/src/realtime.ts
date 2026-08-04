import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { logger } from "./lib/logger";

export const RealtimeEvents = {
  SALE_CREATED: "sale:created",
  INVENTORY_UPDATED: "inventory:updated",
  CASH_CLOSED: "cash:closed",
  /** Client → server relays (localStorage POS fan-out) */
  POS_SALE: "pos:sale",
  POS_INVENTORY: "pos:inventory",
  POS_CASH_CLOSE: "pos:cash-close",
} as const;

let io: Server | null = null;

export function getIO(): Server | null {
  return io;
}

export function emitSaleCreated(payload: unknown): void {
  io?.emit(RealtimeEvents.SALE_CREATED, payload);
}

export function emitInventoryUpdated(payload: unknown): void {
  io?.emit(RealtimeEvents.INVENTORY_UPDATED, payload);
}

export function emitCashClosed(payload: unknown): void {
  io?.emit(RealtimeEvents.CASH_CLOSED, payload);
}

function wireClientRelays(socket: Socket): void {
  socket.on(RealtimeEvents.POS_SALE, (payload) => {
    socket.broadcast.emit(RealtimeEvents.SALE_CREATED, payload);
  });
  socket.on(RealtimeEvents.POS_INVENTORY, (payload) => {
    socket.broadcast.emit(RealtimeEvents.INVENTORY_UPDATED, payload);
  });
  socket.on(RealtimeEvents.POS_CASH_CLOSE, (payload) => {
    socket.broadcast.emit(RealtimeEvents.CASH_CLOSED, payload);
  });
}

export function attachRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    logger.info({ id: socket.id }, "Socket connected");
    wireClientRelays(socket);
    socket.on("disconnect", (reason) => {
      logger.info({ id: socket.id, reason }, "Socket disconnected");
    });
  });

  logger.info("Socket.IO realtime attached");
  return io;
}
