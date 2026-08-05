import { useEffect, useState } from 'react';
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
import { Eye, CreditCard, Banknote, User, Undo2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCOP } from '@/lib/currency';
import { formatPaymentSummary, paymentMethodLabel } from '@/lib/payments';
import { toast } from 'sonner';
import type { Sale } from '@/types';
import {
  CustomerReturnDialog,
  RETURN_REASONS,
} from '@/components/customer-return-dialog';
import { Link } from 'wouter';

const estadoVenta: Record<string, string> = {
  completed: 'COMPLETADA',
  voided: 'ANULADA',
  partially_returned: 'DEVOLUCIÓN PARCIAL',
  returned: 'DEVUELTA',
};

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
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Historial de Ventas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ver facturas y recibos anteriores.
          </p>
        </div>
        <Link href="/devoluciones/cliente">
          <Button variant="outline" className="gap-2">
            <Undo2 className="w-4 h-4" />
            Ir a devoluciones
          </Button>
        </Link>
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
