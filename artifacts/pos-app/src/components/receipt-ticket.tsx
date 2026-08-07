import type { PaymentMethod, Sale } from '@/types';
import { formatCOP } from '@/lib/currency';
import { paymentMethodLabel } from '@/lib/payments';
import { cn } from '@/lib/utils';

export function salePaymentsForReceipt(sale: Sale): { method: PaymentMethod; amount: number }[] {
  if (sale.payments && sale.payments.length > 0) return sale.payments;
  return [{ method: sale.paymentMethod, amount: sale.total }];
}

export function ReceiptTicket({
  sale,
  payments,
  className,
}: {
  sale: Sale;
  payments?: { method: PaymentMethod; amount: number }[];
  className?: string;
}) {
  const rows = payments ?? salePaymentsForReceipt(sale);

  return (
    <div className={cn('pos-thermal-receipt-inner font-mono text-sm text-slate-900', className)}>
      <div className="text-center mb-4">
        <h3 className="font-bold text-base mb-1">Ventanilla Valma</h3>
        <p className="text-xs">Factura / Tique</p>
        <p className="text-xs">{sale.invoiceNumber}</p>
        <p className="text-xs">
          {new Date(sale.createdAt).toLocaleString('es-CO', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
        {sale.cashier && <p className="text-xs mt-1">Cajero: {sale.cashier}</p>}
        {sale.customerName && <p className="text-xs">Cliente: {sale.customerName}</p>}
      </div>

      <div className="border-t border-b border-dashed border-slate-400 py-2 space-y-2 mb-2">
        {sale.items.map((item) => (
          <div key={item.id} className="flex justify-between items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="leading-snug break-words">{item.productName}</div>
              <div className="text-[11px] text-slate-600">
                {item.quantity} x {formatCOP(item.unitPrice)}
              </div>
            </div>
            <div className="shrink-0 font-semibold">{formatCOP(item.subtotal)}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between font-bold text-base pt-1">
          <span>Valor a pagar</span>
          <span>{formatCOP(sale.total)}</span>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs border-t border-dashed border-slate-400 pt-2">
        <div className="font-semibold mb-1">Pagos</div>
        {rows.map((p, idx) => (
          <div key={`${p.method}-${idx}`} className="flex justify-between">
            <span>{paymentMethodLabel(p.method)}</span>
            <span>{formatCOP(p.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold pt-1">
          <span>Cambio</span>
          <span>{formatCOP(sale.changeGiven ?? 0)}</span>
        </div>
      </div>

      <div className="mt-4 text-center text-xs">
        <p>Gracias por su compra</p>
        <p>Ventanilla Valma</p>
      </div>
    </div>
  );
}
