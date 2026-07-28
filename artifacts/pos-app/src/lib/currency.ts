/**
 * Formats a number as Colombian Peso (COP).
 * Uses period as thousands separator, no decimals.
 * Example: 25000 → "$25.000"
 */
export function formatCOP(amount: number): string {
  return '$' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
