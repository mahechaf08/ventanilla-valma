import type { Sale } from '@/types';
import { getDeviceId, resolveApiBaseUrl } from '@/lib/realtime';

export type NeonSalesResponse = {
  sales: Sale[];
  count: number;
  syncedAt: string;
  timezone?: string;
};

/** Fetch ALL shared POS sales from Neon (no cashier/session filter). */
export async function fetchAllSalesFromNeon(opts?: {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}): Promise<NeonSalesResponse | null> {
  const base = resolveApiBaseUrl();
  if (!base) return null;

  const params = new URLSearchParams();
  params.set('limit', String(opts?.limit ?? 2000));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);

  try {
    const res = await fetch(`${base}/api/pos-sync/sales?${params}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NeonSalesResponse;
    if (!data || !Array.isArray(data.sales)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Persist a sale to Neon so other PCs can load it after F5. */
export async function pushSaleToNeon(sale: Sale): Promise<boolean> {
  const base = resolveApiBaseUrl();
  if (!base) return false;

  try {
    const res = await fetch(`${base}/api/pos-sync/sales`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sale,
        deviceId: getDeviceId(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Upload this terminal's local sales into Neon (one-time catch-up). */
export async function pushSalesBulkToNeon(sales: Sale[]): Promise<number> {
  const base = resolveApiBaseUrl();
  if (!base || sales.length === 0) return 0;

  try {
    const res = await fetch(`${base}/api/pos-sync/sales/bulk`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sales,
        deviceId: getDeviceId(),
      }),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { upserted?: number };
    return data.upserted ?? 0;
  } catch {
    return 0;
  }
}

export type PurgeScope = 'sales' | 'cash' | 'full';

/**
 * Admin-only Neon purge. Requires Neon admin username/password + confirmation BORRAR.
 */
export async function purgeNeonTransactionalData(input: {
  scope: PurgeScope;
  username: string;
  password: string;
  confirmation: string;
}): Promise<{ ok: boolean; error?: string; posSalesDeleted?: number }> {
  const base = resolveApiBaseUrl();
  if (!base) {
    return { ok: false, error: 'API no configurada (VITE_SOCKET_URL / VITE_API_URL)' };
  }

  try {
    const res = await fetch(`${base}/api/admin/purge`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: input.scope,
        username: input.username,
        password: input.password,
        confirmation: input.confirmation,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      posSalesDeleted?: number;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || `Error ${res.status}` };
    }
    return {
      ok: true,
      posSalesDeleted: data.posSalesDeleted,
    };
  } catch {
    return { ok: false, error: 'No se pudo contactar el servidor' };
  }
}
