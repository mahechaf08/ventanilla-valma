import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCOP } from '@/lib/currency';
import { PAYMENT_METHODS } from '@/lib/payments';
import type { CustomerReturnReason, PaymentMethod, Sale } from '@/types';

export const RETURN_REASONS: { value: CustomerReturnReason; label: string }[] = [
  { value: 'defective', label: 'Defectuoso' },
  { value: 'exchange', label: 'Cambio / intercambio' },
  { value: 'customer_request', label: 'Solicitud del cliente' },
  { value: 'other', label: 'Otro' },
];

export type CustomerReturnSubmitPayload = {
  reason: CustomerReturnReason;
  reasonNotes?: string;
  items: { saleItemId: number; quantity: number }[];
  refundMethod: PaymentMethod;
};

export function CustomerReturnDialog({
  open,
  sale,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  sale: Sale;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CustomerReturnSubmitPayload) => void;
}) {
  const [reason, setReason] = useState<CustomerReturnReason>('customer_request');
  const [reasonNotes, setReasonNotes] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>(
    sale.paymentMethod === 'cash' ? 'cash' : sale.paymentMethod,
  );
  const [qtys, setQtys] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;
    const init: Record<number, string> = {};
    for (const item of sale.items) {
      const remaining = item.quantity - (item.returnedQuantity ?? 0);
      init[item.id] = remaining > 0 ? String(remaining) : '0';
    }
    setQtys(init);
    setReason('customer_request');
    setReasonNotes('');
    setRefundMethod(sale.paymentMethod === 'cash' ? 'cash' : sale.paymentMethod);
  }, [open, sale]);

  const lines = useMemo(() => {
    return sale.items
      .map((item) => {
        const remaining = item.quantity - (item.returnedQuantity ?? 0);
        const qty = Math.min(remaining, Math.max(0, Math.floor(Number(qtys[item.id]) || 0)));
        return { item, remaining, qty, subtotal: qty * item.unitPrice };
      })
      .filter((l) => l.remaining > 0);
  }, [sale.items, qtys]);

  const refundTotal = lines.reduce((sum, l) => sum + l.subtotal, 0);

  const setAllRemaining = () => {
    const next: Record<number, string> = {};
    for (const item of sale.items) {
      const remaining = item.quantity - (item.returnedQuantity ?? 0);
      next[item.id] = String(Math.max(0, remaining));
    }
    setQtys(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Devolución de producto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Factura{' '}
            <span className="font-mono font-medium text-slate-800">{sale.invoiceNumber}</span>. El
            stock se restaura automáticamente. Si reembolsas en efectivo, se registra una salida de
            caja para el cierre.
          </p>

          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={setAllRemaining}>
              Devolver todo lo pendiente
            </Button>
          </div>

          <div className="space-y-2 max-h-56 overflow-auto rounded-lg border border-slate-200 p-3">
            {lines.map(({ item, remaining }) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.productName}</div>
                  <div className="text-xs text-slate-500">
                    Disponible a devolver: {remaining} · {formatCOP(item.unitPrice)} c/u
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={remaining}
                  className="w-20 font-mono"
                  value={qtys[item.id] ?? '0'}
                  onChange={(e) => setQtys((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
              </div>
            ))}
            {lines.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">Nada pendiente por devolver.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as CustomerReturnReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Método de reembolso</Label>
              <Select
                value={refundMethod}
                onValueChange={(v) => setRefundMethod(v as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Textarea
              value={reasonNotes}
              onChange={(e) => setReasonNotes(e.target.value)}
              placeholder="Detalle del motivo..."
              rows={2}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex justify-between text-sm">
            <span className="text-slate-600">Total a reembolsar</span>
            <span className="font-mono font-bold text-slate-900">{formatCOP(refundTotal)}</span>
          </div>
          {refundMethod === 'cash' && refundTotal > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Se registrará una salida de caja de {formatCOP(refundTotal)} (impacto en cierre de
              caja).
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={refundTotal <= 0}
            onClick={() =>
              onSubmit({
                reason,
                reasonNotes: reasonNotes.trim() || undefined,
                refundMethod,
                items: lines
                  .filter((l) => l.qty > 0)
                  .map((l) => ({ saleItemId: l.item.id, quantity: l.qty })),
              })
            }
          >
            Confirmar devolución
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
