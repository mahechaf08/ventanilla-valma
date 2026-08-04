import { io, type Socket } from 'socket.io-client';
import type { CashClose, InventoryMovement, Product, Sale } from '@/types';

export const RealtimeEvents = {
  SALE_CREATED: 'sale:created',
  INVENTORY_UPDATED: 'inventory:updated',
  CASH_CLOSED: 'cash:closed',
  POS_SALE: 'pos:sale',
  POS_INVENTORY: 'pos:inventory',
  POS_CASH_CLOSE: 'pos:cash-close',
} as const;

const DEVICE_KEY = 'vv_device_id';

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}

export type SaleRealtimePayload = {
  deviceId: string;
  sale: Sale;
  products?: Product[];
};

export type InventoryRealtimePayload = {
  deviceId: string;
  movement: InventoryMovement;
  products?: Product[];
};

export type CashCloseRealtimePayload = {
  deviceId: string;
  cashClose: CashClose;
};

function resolveSocketUrl(): string | null {
  const fromEnv = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:8080';
  // Same-origin (API reverse-proxied) — leave empty string for default
  if (typeof window !== 'undefined') return window.location.origin;
  return null;
}

let socket: Socket | null = null;

export function getRealtimeSocket(): Socket | null {
  return socket;
}

export function connectRealtime(): Socket | null {
  if (socket?.connected) return socket;
  const url = resolveSocketUrl();
  if (!url) return null;

  socket = io(url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

export function publishSale(payload: Omit<SaleRealtimePayload, 'deviceId'> & { deviceId?: string }) {
  const s = connectRealtime();
  s?.emit(RealtimeEvents.POS_SALE, {
    ...payload,
    deviceId: payload.deviceId ?? getDeviceId(),
  });
}

export function publishInventory(
  payload: Omit<InventoryRealtimePayload, 'deviceId'> & { deviceId?: string },
) {
  const s = connectRealtime();
  s?.emit(RealtimeEvents.POS_INVENTORY, {
    ...payload,
    deviceId: payload.deviceId ?? getDeviceId(),
  });
}

export function publishCashClose(
  payload: Omit<CashCloseRealtimePayload, 'deviceId'> & { deviceId?: string },
) {
  const s = connectRealtime();
  s?.emit(RealtimeEvents.POS_CASH_CLOSE, {
    ...payload,
    deviceId: payload.deviceId ?? getDeviceId(),
  });
}
