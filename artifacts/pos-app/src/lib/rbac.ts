import type { AuthUser, Sale } from '@/types';

/** Whether a sale was issued by the given cashier (by user id, with username fallback). */
export function saleBelongsToCashier(
  sale: Sale,
  user: Pick<AuthUser, 'id' | 'username'> | null | undefined,
): boolean {
  if (!user) return false;
  if (sale.cashierUserId != null && sale.cashierUserId === user.id) return true;
  const cashierName = sale.cashier?.trim().toLowerCase();
  const username = user.username?.trim().toLowerCase();
  if (cashierName && username && cashierName === username) return true;
  return false;
}
