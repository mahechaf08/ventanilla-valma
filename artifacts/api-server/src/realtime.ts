import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { db, posSalesTable } from "@workspace/db";
import { logger } from "./lib/logger";
import { bogotaDateKey } from "./lib/timezone";

export const RealtimeEvents = {
  SALE_CREATED: "sale:created",
  /** Alias for clients that listen for new_sale */
  NEW_SALE: "new_sale",
  /** Global invalidate signal — clients should refetch from Neon */
  SALES_UPDATED: "sales_updated",
  INVENTORY_UPDATED: "inventory:updated",
  CASH_CLOSED: "cash:closed",
  /** Client → server relays (localStorage POS fan-out) */
  POS_SALE: "pos:sale",
  POS_INVENTORY: "pos:inventory",
  POS_CASH_CLOSE: "pos:cash-close",
  /** Reconnecting client asks for recent sales buffer */
  POS_SYNC_REQUEST: "pos:sync-request",
  /** Server → client: recent sales payload */
  SALES_SYNC: "sales:sync",
} as const;

const MAX_BUFFERED_SALES = 300;

type SaleSyncEntry = {
  deviceId?: string;
  sale: unknown;
  products?: unknown;
  receivedAt: string;
};

let io: Server | null = null;
const recentSales: SaleSyncEntry[] = [];

function saleKey(sale: unknown): string | null {
  if (!sale || typeof sale !== "object") return null;
  const s = sale as { invoiceNumber?: string; id?: number | string };
  if (s.invoiceNumber) return `inv:${s.invoiceNumber}`;
  if (s.id != null) return `id:${s.id}`;
  return null;
}

function pushSaleToBuffer(payload: {
  deviceId?: string;
  sale?: unknown;
  products?: unknown;
}): void {
  if (!payload?.sale) return;
  const key = saleKey(payload.sale);
  if (key) {
    const idx = recentSales.findIndex((e) => saleKey(e.sale) === key);
    if (idx >= 0) recentSales.splice(idx, 1);
  }
  recentSales.unshift({
    deviceId: payload.deviceId,
    sale: payload.sale,
    products: payload.products,
    receivedAt: new Date().toISOString(),
  });
  if (recentSales.length > MAX_BUFFERED_SALES) {
    recentSales.length = MAX_BUFFERED_SALES;
  }
}

export function getRecentSalesBuffer(sinceIso?: string): SaleSyncEntry[] {
  if (!sinceIso) return [...recentSales];
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return [...recentSales];
  return recentSales.filter((e) => {
    const t = Date.parse(e.receivedAt);
    return !Number.isNaN(t) && t >= since;
  });
}

export function getIO(): Server | null {
  return io;
}

function broadcastSale(payload: unknown): void {
  io?.emit(RealtimeEvents.SALE_CREATED, payload);
  io?.emit(RealtimeEvents.NEW_SALE, payload);
}

export function emitSaleCreated(payload: unknown): void {
  const p = payload as { deviceId?: string; sale?: unknown; products?: unknown };
  if (p?.sale) {
    pushSaleToBuffer(p);
  } else {
    pushSaleToBuffer({ sale: (payload as { sale?: unknown })?.sale });
  }
  broadcastSale(payload);
}

export function emitSalesUpdated(payload: unknown): void {
  io?.emit(RealtimeEvents.SALES_UPDATED, payload);
}

export function emitInventoryUpdated(payload: unknown): void {
  io?.emit(RealtimeEvents.INVENTORY_UPDATED, payload);
}

export function emitCashClosed(payload: unknown): void {
  io?.emit(RealtimeEvents.CASH_CLOSED, payload);
}

async function persistPosSaleToNeon(payload: {
  deviceId?: string;
  sale?: unknown;
}): Promise<void> {
  const sale = payload.sale as Record<string, unknown> | undefined;
  if (!sale || typeof sale.invoiceNumber !== "string") return;

  const invoiceNumber = String(sale.invoiceNumber);
  const createdAtRaw =
    typeof sale.createdAt === "string" ? sale.createdAt : new Date().toISOString();
  const values = {
    invoiceNumber,
    payload: sale,
    localSaleId: typeof sale.id === "number" ? sale.id : null,
    cashier: typeof sale.cashier === "string" ? sale.cashier : null,
    cashierUserId: typeof sale.cashierUserId === "number" ? sale.cashierUserId : null,
    status: String(sale.status ?? "completed"),
    total: String(sale.total ?? 0),
    dateKey: bogotaDateKey(createdAtRaw),
    deviceId: payload.deviceId ?? null,
    updatedAt: new Date(),
  };

  try {
    await db
      .insert(posSalesTable)
      .values({
        ...values,
        createdAt: new Date(createdAtRaw),
      })
      .onConflictDoUpdate({
        target: posSalesTable.invoiceNumber,
        set: {
          payload: values.payload,
          localSaleId: values.localSaleId,
          cashier: values.cashier,
          cashierUserId: values.cashierUserId,
          status: values.status,
          total: values.total,
          dateKey: values.dateKey,
          deviceId: values.deviceId,
          updatedAt: values.updatedAt,
        },
      });
    emitSalesUpdated({
      reason: "sale_upserted",
      invoiceNumber,
      deviceId: payload.deviceId,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Table may not exist until drizzle push — log and keep socket fan-out working
    logger.error({ err, invoiceNumber }, "Neon pos_sales upsert failed");
  }
}

function wireClientRelays(socket: Socket): void {
  socket.on(RealtimeEvents.POS_SALE, (payload) => {
    const p = payload as { deviceId?: string; sale?: unknown; products?: unknown };
    pushSaleToBuffer(p);
    socket.broadcast.emit(RealtimeEvents.SALE_CREATED, payload);
    socket.broadcast.emit(RealtimeEvents.NEW_SALE, payload);
    void persistPosSaleToNeon(p);
  });
  socket.on(RealtimeEvents.POS_INVENTORY, (payload) => {
    socket.broadcast.emit(RealtimeEvents.INVENTORY_UPDATED, payload);
  });
  socket.on(RealtimeEvents.POS_CASH_CLOSE, (payload) => {
    socket.broadcast.emit(RealtimeEvents.CASH_CLOSED, payload);
  });
  socket.on(RealtimeEvents.POS_SYNC_REQUEST, (query?: { since?: string }) => {
    const entries = getRecentSalesBuffer(query?.since);
    socket.emit(RealtimeEvents.SALES_SYNC, {
      sales: entries,
      syncedAt: new Date().toISOString(),
    });
    logger.info(
      { id: socket.id, count: entries.length },
      "Sales sync sent to client",
    );
  });
}

export function attachRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/socket.io",
    pingInterval: 20000,
    pingTimeout: 25000,
  });

  io.on("connection", (socket) => {
    logger.info({ id: socket.id }, "Socket connected");
    wireClientRelays(socket);
    const entries = getRecentSalesBuffer();
    if (entries.length > 0) {
      socket.emit(RealtimeEvents.SALES_SYNC, {
        sales: entries,
        syncedAt: new Date().toISOString(),
      });
    }
    // Tell clients to pull durable Neon ledger on connect
    socket.emit(RealtimeEvents.SALES_UPDATED, {
      reason: "connected",
      syncedAt: new Date().toISOString(),
    });
    socket.on("disconnect", (reason) => {
      logger.info({ id: socket.id, reason }, "Socket disconnected");
    });
  });

  logger.info("Socket.IO realtime attached");
  return io;
}
