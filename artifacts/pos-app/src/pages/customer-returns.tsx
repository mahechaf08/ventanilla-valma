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
import { Card, CardContent } from '@/components/ui/card';
import { Search, Undo2, PackageOpen } from 'lucide-react';
import { formatCOP } from '@/lib/currency';
import { formatPaymentSummary } from '@/lib/payments';
import { toast } from 'sonner';
import type { Sale } from '@/types';
import {
  CustomerReturnDialog,
  RETURN_REASONS,
} from '@/components/customer-return-dialog';

const estadoVenta: Record<string, string> = {
  completed: 'COMPLETADA',
  voided: 'ANULADA',
  partially_returned: 'DEVOLUCIÓN PARCIAL',
  returned: 'DEVUELTA',
};

function canReturnSale(sale: Sale): boolean {
  return (
    sale.source !== 'employee_consumption' &&
    sale.status !== 'voided' &&
    sale.status !== 'returned' &&
    sale.items.some((i) => (i.returnedQuantity ?? 0) < i.quantity)
  );
}

export default function CustomerReturnsPage() {
  const { sales, createCustomerReturn, listCustomerReturns } = useData();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);

  useEffect(() => {
    if (!selectedSale) return;
    const fresh = sales.find((s) => s.id === selectedSale.id);
    if (fresh) setSelectedSale(fresh);
  }, [sales, selectedSale?.id]);

  const returnableSales = useMemo(() => {
    return sales
      .filter((s) => s.source !== 'employee_consumption' && s.status !== 'voided')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return returnableSales.slice(0, 40);
    return returnableSales
      .filter((s) => {
        const invoice = s.invoiceNumber.toLowerCase();
        const customer = (s.customerName ?? '').toLowerCase();
        const cashier = (s.cashier ?? '').toLowerCase();
        return invoice.includes(q) || customer.includes(q) || cashier.includes(q);
      })
      .slice(0, 60);
  }, [query, returnableSales]);

  const recentReturns = listCustomerReturns().slice(0, 8);

  const openReturn = (sale: Sale) => {
    if (!canReturnSale(sale)) {
      toast.error('Esta venta no tiene artículos pendientes por devolver');
      return;
    }
    setSelectedSale(sale);
    setReturnOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-amber-50 p-2 text-amber-700">
            <PackageOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Devolución de Producto</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Busca una factura, selecciona la venta y devuelve artículos parcial o totalmente. El
              stock se restaura y el reembolso en efectivo ajusta el cierre de caja.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-9 h-11"
                placeholder="Buscar por factura, cliente o cajero..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Ejemplo: <span className="font-mono">VV-20260805-1234</span>
            </p>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No se encontraron ventas con ese criterio.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((sale) => {
                  const pending = canReturnSale(sale);
                  return (
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
                        <Badge variant="outline" className="text-[10px]">
                          {estadoVenta[sale.status] ?? sale.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatPaymentSummary(sale)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatCOP(sale.total)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          className={
                            pending
                              ? 'bg-amber-600 hover:bg-amber-700 text-white gap-1.5'
                              : 'gap-1.5'
                          }
                          variant={pending ? 'default' : 'outline'}
                          disabled={!pending}
                          onClick={(e) => {
                            e.stopPropagation();
                            openReturn(sale);
                          }}
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          Devolver
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {selectedSale && (
          <Card className="border-slate-200">
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Venta seleccionada</div>
                  <div className="text-lg font-mono font-bold text-slate-900">
                    {selectedSale.invoiceNumber}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {format(new Date(selectedSale.createdAt), "d MMM yyyy, h:mm a", { locale: es })}
                    {selectedSale.cashier ? ` · ${selectedSale.cashier}` : ''}
                  </p>
                </div>
                {canReturnSale(selectedSale) && (
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                    onClick={() => setReturnOpen(true)}
                  >
                    <Undo2 className="w-4 h-4" />
                    Procesar devolución
                  </Button>
                )}
              </div>

              <div className="rounded-lg border border-slate-100 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Vendidos</TableHead>
                      <TableHead className="text-right">Devueltos</TableHead>
                      <TableHead className="text-right">Pendientes</TableHead>
                      <TableHead className="text-right">P. unit.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSale.items.map((item) => {
                      const returned = item.returnedQuantity ?? 0;
                      const pending = item.quantity - returned;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-amber-700">
                            {returned}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {pending}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCOP(item.unitPrice)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {listCustomerReturns(selectedSale.id).length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                  <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                    Devoluciones de esta factura
                  </div>
                  {listCustomerReturns(selectedSale.id).map((r) => (
                    <div key={r.id} className="text-xs text-amber-950 flex justify-between gap-2">
                      <span>
                        {format(new Date(r.createdAt), 'd MMM, h:mm a', { locale: es })} ·{' '}
                        {RETURN_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}
                        {r.refundCashAmount > 0 ? ' · efectivo' : ''}
                      </span>
                      <span className="font-mono font-semibold">{formatCOP(r.refundTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {recentReturns.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Últimas devoluciones</h2>
              <div className="space-y-2">
                {recentReturns.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-mono font-medium">{r.invoiceNumber}</span>
                      <span className="text-slate-500">
                        {' '}
                        · {format(new Date(r.createdAt), 'd MMM, h:mm a', { locale: es })} ·{' '}
                        {RETURN_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}
                      </span>
                    </div>
                    <span className="font-mono font-semibold">{formatCOP(r.refundTotal)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
