export function load<T>(key: string, fallback: T): T {
  try {
    migrateLegacyKey(key);
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function remove(key: string): void {
  localStorage.removeItem(key);
}

/** Current brand prefix for localStorage keys. */
const PREFIX = 'vv_';
/** Previous brand prefix (Fuego Verde) — migrated once into vv_ keys. */
const LEGACY_PREFIX = 'fv_';

export const KEYS = {
  users: `${PREFIX}users`,
  usersSeedVersion: `${PREFIX}users_seed_version`,
  products: `${PREFIX}products`,
  sales: `${PREFIX}sales`,
  movements: `${PREFIX}movements`,
  consumptions: `${PREFIX}consumptions`,
  cashMovements: `${PREFIX}cash_movements`,
  supplierInvoices: `${PREFIX}supplier_invoices`,
  cashCloses: `${PREFIX}cash_closes`,
  purchaseOrders: `${PREFIX}purchase_orders`,
  session: `${PREFIX}session`,
  nextIds: `${PREFIX}next_ids`,
} as const;

function legacyKeyFor(key: string): string | null {
  if (!key.startsWith(PREFIX)) return null;
  return `${LEGACY_PREFIX}${key.slice(PREFIX.length)}`;
}

/** Copy fv_* → vv_* when the new key is missing so existing data is preserved. */
function migrateLegacyKey(key: string): void {
  try {
    if (localStorage.getItem(key) != null) return;
    const legacy = legacyKeyFor(key);
    if (!legacy) return;
    const raw = localStorage.getItem(legacy);
    if (raw == null) return;
    localStorage.setItem(key, raw);
  } catch {
    // Ignore quota / private-mode failures; load will use fallback.
  }
}

export interface NextIds {
  user: number;
  product: number;
  sale: number;
  saleItem: number;
  movement: number;
  consumption: number;
  cashMovement: number;
  supplierInvoice: number;
  cashClose: number;
  purchaseOrder: number;
}

export const DEFAULT_NEXT_IDS: NextIds = {
  user: 3,
  product: 100,
  sale: 1,
  saleItem: 1,
  movement: 1,
  consumption: 1,
  cashMovement: 1,
  supplierInvoice: 1,
  cashClose: 1,
  purchaseOrder: 1,
};
