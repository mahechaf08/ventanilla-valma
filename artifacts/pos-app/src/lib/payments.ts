import type { PaymentMethod, Sale, SalePayment } from '@/types';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  transfer: 'Transferencia',
  other: 'Otro',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

/** Cash portion of a sale (supports split payments). */
export function saleCashAmount(sale: Sale): number {
  if (sale.payments && sale.payments.length > 0) {
    return sale.payments
      .filter((p) => p.method === 'cash')
      .reduce((sum, p) => sum + p.amount, 0);
  }
  return sale.paymentMethod === 'cash' ? sale.total : 0;
}

export function saleNonCashAmount(sale: Sale): number {
  return Math.max(0, sale.total - saleCashAmount(sale));
}

/** Primary method for legacy display: largest allocation, else paymentMethod. */
export function primaryPaymentMethod(sale: Sale): PaymentMethod {
  if (sale.payments && sale.payments.length > 0) {
    if (sale.payments.length > 1) {
      // Prefer explicit primary or largest slice
      const sorted = [...sale.payments].sort((a, b) => b.amount - a.amount);
      return sorted[0].method;
    }
    return sale.payments[0].method;
  }
  return sale.paymentMethod;
}

export function formatPaymentSummary(sale: Sale): string {
  if (sale.payments && sale.payments.length > 1) {
    return 'Pago mixto';
  }
  return paymentMethodLabel(primaryPaymentMethod(sale));
}

export function normalizePayments(
  payments: SalePayment[],
  saleTotal: number,
): { payments: SalePayment[]; changeGiven: number; primary: PaymentMethod } {
  const cleaned = payments
    .map((p) => ({
      method: p.method,
      amount: Math.round(Number(p.amount) || 0),
    }))
    .filter((p) => p.amount > 0);

  if (!cleaned.length) {
    throw new Error('Agrega al menos un método de pago con monto');
  }

  const entered = cleaned.reduce((s, p) => s + p.amount, 0);
  if (entered < saleTotal) {
    throw new Error('El total ingresado es menor al total a pagar');
  }

  const changeGiven = entered - saleTotal;
  const primary = [...cleaned].sort((a, b) => b.amount - a.amount)[0].method;
  return { payments: cleaned, changeGiven, primary };
}
