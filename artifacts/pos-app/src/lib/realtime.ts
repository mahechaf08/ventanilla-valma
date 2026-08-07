import { io, type Socket } from 'socket.io-client';
import type { CashClose, InventoryMovement, Product, Sale } from '@/types';

export const RealtimeEvents = {
  SALE_CREATED: 'sale:created',
  NEW_SALE: 'new_sale',
  SALES_UPDATED: 'sales_updated',
  INVENTORY_UPDATED: 'inventory:updated',
  CASH_CLOSED: 'cash:closed',
  POS_SALE: 'pos:sale',
  POS_INVENTORY: 'pos:inventory',
  POS_CASH_CLOSE: 'pos:cash-close',
  POS_SYNC_REQUEST: 'pos:sync-request',
  SALES_SYNC: 'sales:sync',
} as const;

const DEVICE_KEY = 'vv_device_id';
const LAST_SYNC_KEY = 'vv_sales_last_sync';

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

export type SalesSyncEntry = {
  deviceId?: string;
  sale: Sale;
  products?: Product[];
  receivedAt?: string;
};

export type SalesSyncPayload = {
  sales: SalesSyncEntry[];
  syncedAt: string;
};

function resolveSocketUrl(): string | null {
  const fromEnv = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:8080';
  // Same-origin (API reverse-proxied) — leave empty string for default
  if (typeof window !== 'undefined') return window.location.origin;
  return null;
}

/** HTTP origin for Render API sync (same host as Socket.IO by default). */
export function resolveApiBaseUrl(): string | null {
  const fromApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromApi) return fromApi.replace(/\/$/, '');
  return resolveSocketUrl();
}

let socket: Socket | null = null;
let lifecycleBound = false;

function ensureLifecycleWatchers(): void {
  if (lifecycleBound || typeof window === 'undefined') return;
  lifecycleBound = true;

  const wake = () => {
    const s = connectRealtime();
    if (s && !s.connected) s.connect();
  };

  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
  window.addEventListener('focus', wake);
}

export function getRealtimeSocket(): Socket | null {
  return socket;
}

export function connectRealtime(): Socket | null {
  ensureLifecycleWatchers();

  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  const url = resolveSocketUrl();
  if (!url) return null;

  socket = io(url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 20000,
    randomizationFactor: 0.4,
  });

  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

export function getLastSalesSyncAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export function setLastSalesSyncAt(iso: string): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch {
    /* ignore */
  }
}

/** Ask the Socket.IO server for the recent sales buffer. */
export function requestSalesSync(since?: string): boolean {
  const s = connectRealtime();
  if (!s) return false;
  s.emit(RealtimeEvents.POS_SYNC_REQUEST, {
    since: since ?? getLastSalesSyncAt() ?? undefined,
  });
  return true;
}

/**
 * Fetch recent sales from the Render/API HTTP mirror of the socket buffer.
 * Returns null when the API is unreachable.
 */
export async function fetchSalesSyncFromApi(
  since?: string,
): Promise<SalesSyncPayload | null> {
  const base = resolveApiBaseUrl();
  if (!base) return null;

  const params = new URLSearchParams();
  const sinceVal = since ?? getLastSalesSyncAt();
  if (sinceVal) params.set('since', sinceVal);
  const qs = params.toString();
  const url = `${base}/api/realtime/sales${qs ? `?${qs}` : ''}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SalesSyncPayload;
    if (!data || !Array.isArray(data.sales)) return null;
    return data;
  } catch {
    return null;
  }
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
