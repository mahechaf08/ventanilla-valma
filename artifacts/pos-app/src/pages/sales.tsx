import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
import { Eye, CreditCard, Banknote, User, Undo2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCOP } from '@/lib/currency';
import {
  formatPaymentSummary,
  paymentMethodLabel,
  PAYMENT_METHODS,
} from '@/lib/payments';
import { toast } from 'sonner';
import type { CustomerReturnReason, PaymentMethod, Sale } from '@/types';

const estadoVenta: Record<string, string> = {
  completed: 'COMPLETADA',
  voided: 'ANULADA',
  partially_returned: 'DEVOLUCIÓN PARCIAL',
  returned: 'DEVUELTA',
};

const RETURN_REASONS: { value: CustomerReturnReason; label: string }[] = [
  { value: 'defective', label: 'Defectuoso' },
  { value: 'exchange', label: 'Cambio / intercambio' },
  { value: 'customer_request', label: 'Solicitud del cliente' },
  { value: 'other', label: 'Otro' },
];

export default function Sales() {
  const { listSales, createCustomerReturn, listCustomerReturns, sales } = useData();
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const pageSales = listSales({ limit, offset });

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);

  useEffect(() => {
    if (!selectedSale) return;
    const fresh = sales.find((s) => s.id === selectedSale.id);
    if (fresh) setSelectedSale(fresh);
  }, [sales, selectedSale?.id]);

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'card':
        return <CreditCard className="w-3 h-3" />;
      case 'cash':
        return <Banknote className="w-3 h-3" />;
      default:
        return <User className="w-3 h-3" />;
    }
  };

  const statusBadgeClass = (status: string) => {
    if (status === 'returned') return 'bg-amber-100 text-amber-900 border-amber-200';
    if (status === 'partially_returned') return 'bg-blue-50 text-blue-800 border-blue-200';
    if (status === 'voided') return 'bg-red-50 text-red-800 border-red-200';
    return '';
  };

  const canReturn =
    selectedSale &&
    selectedSale.source !== 'employee_consumption' &&
    selectedSale.status !== 'voided' &&
    selectedSale.status !== 'returned' &&
    selectedSale.items.some((i) => (i.returnedQuantity ?? 0) < i.quantity);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Historial de Ventas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ver facturas, recibos y registrar devoluciones de clientes.
          </p>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead>Factura #</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Artículos</TableHead>
                <TableHead className="text-right">Total (COP)</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No hay ventas registradas aún.
                  </TableCell>
                </TableRow>
              ) : (
                pageSales.map((sale) => (
                  <TableRow
                    key={sale.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelectedSale(sale)}
                  >
                    <TableCell className="font-mono font-medium">{sale.invoiceNumber}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(sale.createdAt), 'd MMM yyyy, h:mm a', { locale: es })}
                    </TableCell>
                    <TableCell>
                      {sale.customerName || (
                        <span className="text-muted-foreground italic">Cliente en tienda</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${statusBadgeClass(sale.status)}`}
                      >
                        {estadoVenta[sale.status] ?? sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] gap-1 px-2 py-0 h-5">
                        {getPaymentIcon(sale.paymentMethod)} {formatPaymentSummary(sale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-mono">
                      {sale.items.length}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">
                      {formatCOP(sale.total)}
                      {(sale.returnedTotal ?? 0) > 0 && (
                        <div className="text-[10px] font-normal text-amber-700">
                          Devuelto {formatCOP(sale.returnedTotal ?? 0)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <div>Mostrando {pageSales.length} ventas</div>
          <div className="space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
              disabled={offset === 0}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset((o) => o + limit)}
              disabled={pageSales.length < limit}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedSale} onOpenChange={(open) => !open && setSelectedSale(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Detalle de Factura</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="py-6 px-4 bg-white border border-slate-200 rounded-xl shadow-sm font-mono text-sm">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="font-bold text-lg">Ventanilla Valma</h3>
                    <p className="text-muted-foreground">Recibo {selectedSale.invoiceNumber}</p>
                  </div>
                  <div className="text-right text-muted-foreground text-xs">
                    {format(new Date(selectedSale.createdAt), 'dd/MM/yyyy')}
                    <br />
                    {format(new Date(selectedSale.createdAt), 'h:mm a')}
                  </div>
                </div>

                {selectedSale.customerName && (
                  <div className="mb-6 text-sm">
                    <span className="text-muted-foreground block text-xs">Cliente:</span>
                    <span className="font-sans font-medium">{selectedSale.customerName}</span>
                  </div>
                )}

                <div className="space-y-3 mb-6">
                  <div className="grid grid-cols-12 text-xs font-bold text-muted-foreground pb-2 border-b">
                    <div className="col-span-5">ARTÍCULO</div>
                    <div className="col-span-4 text-right">CANT×PRECIO</div>
                    <div className="col-span-3 text-right">TOTAL</div>
                  </div>
                  {selectedSale.items.map((item) => {
                    const returned = item.returnedQuantity ?? 0;
                    return (
                      <div key={item.id} className="grid grid-cols-12 items-start py-1">
                        <div className="col-span-5 font-sans text-sm">
                          {item.productName}
                          {returned > 0 && (
                            <div className="text-[10px] text-amber-700 font-sans">
                              Devuelto: {returned}/{item.quantity}
                            </div>
                          )}
                        </div>
                        <div className="col-span-4 text-right text-xs text-muted-foreground mt-0.5">
                          {item.quantity} × {formatCOP(item.unitPrice)}
                        </div>
                        <div className="col-span-3 text-right">{formatCOP(item.subtotal)}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2 border-t pt-4">
                  <div className="flex justify-between font-bold text-base pt-2">
                    <span>Total</span>
                    <span className="text-primary">{formatCOP(selectedSale.total)}</span>
                  </div>
                </div>

                <div className="mt-6 text-xs text-muted-foreground bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-1">
                  <div>
                    Estado:{' '}
                    <span className="uppercase font-bold text-foreground">
                      {estadoVenta[selectedSale.status] ?? selectedSale.status}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-slate-700">
                    <div className="font-semibold text-slate-900">Pagos</div>
                    {(selectedSale.payments && selectedSale.payments.length > 0
                      ? selectedSale.payments
                      : [{ method: selectedSale.paymentMethod, amount: selectedSale.total }]
                    ).map((p, idx) => (
                      <div key={`${p.method}-${idx}`} className="flex justify-between font-mono">
                        <span>{paymentMethodLabel(p.method)}</span>
                        <span>{formatCOP(p.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-mono font-semibold text-slate-900 pt-1">
                      <span>Cambio</span>
                      <span>{formatCOP(selectedSale.changeGiven ?? 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {listCustomerReturns(selectedSale.id).length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                  <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                    Historial de devoluciones
                  </div>
                  {listCustomerReturns(selectedSale.id).map((r) => (
                    <div key={r.id} className="text-xs text-amber-950 flex justify-between gap-2">
                      <span>
                        {format(new Date(r.createdAt), 'd MMM, h:mm a', { locale: es })} ·{' '}
                        {RETURN_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}
                        {r.refundCashAmount > 0 ? ' · reembolso en efectivo' : ''}
                      </span>
                      <span className="font-mono font-semibold">{formatCOP(r.refundTotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              {canReturn && (
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                  onClick={() => setReturnOpen(true)}
                >
                  <Undo2 className="w-4 h-4" />
                  Devolución / Return
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedSale && (
        <CustomerReturnDialog
          open={returnOpen}
          sale={selectedSale}
          onOpenChange={setReturnOpen}
          onSubmit={(payload) => {
            if (!user) {
              toast.error('Sesión no válida');
              return;
            }
            try {
              const result = createCustomerReturn({
                ...payload,
                saleId: selectedSale.id,
                processedBy: user.username,
                processedByUserId: user.id,
              });
              toast.success(
                `Devolución registrada · ${formatCOP(result.refundTotal)}${
                  result.refundCashAmount > 0
                    ? ` · caja −${formatCOP(result.refundCashAmount)}`
                    : ''
                }`,
              );
              setReturnOpen(false);
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : 'Error al registrar devolución');
            }
          }}
        />
      )}
    </div>
  );
}

function CustomerReturnDialog({
  open,
  sale,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  sale: Sale;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    reason: CustomerReturnReason;
    reasonNotes?: string;
    items: { saleItemId: number; quantity: number }[];
    refundMethod: PaymentMethod;
  }) => void;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Devolución de cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Factura <span className="font-mono font-medium text-slate-800">{sale.invoiceNumber}</span>
            . El stock se restaura automáticamente. Si reembolsas en efectivo, se registra una
            salida de caja para el cierre.
          </p>

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
