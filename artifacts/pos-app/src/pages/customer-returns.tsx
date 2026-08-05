import { useMemo, useState } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Search, Undo2, PackageOpen, UserRound } from 'lucide-react';
import { formatCOP } from '@/lib/currency';
import { toast } from 'sonner';
import type { CustomerReturnReason, Sale, SaleItem } from '@/types';
import { RETURN_REASONS } from '@/components/customer-return-dialog';

type ReturnableLine = {
  key: string;
  sale: Sale;
  item: SaleItem;
  barcode: string | null;
  soldQty: number;
  returnedQty: number;
  remainingQty: number;
  originalCashier: string;
  originalCashierUserId: number | null;
};

export default function CustomerReturnsPage() {
  const { sales, products, createCustomerReturn, listCustomerReturns } = useData();
  const { user, listUsers } = useAuth();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReturnableLine | null>(null);
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState<CustomerReturnReason>('customer_request');
  const [reasonNotes, setReasonNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const usersByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of listUsers()) {
      map.set(u.username.trim().toLowerCase(), u.id);
    }
    return map;
  }, [listUsers]);

  const returnableLines = useMemo((): ReturnableLine[] => {
    const rows: ReturnableLine[] = [];
    for (const sale of sales) {
      if (sale.source === 'employee_consumption') continue;
      if (sale.status === 'voided') continue;

      const originalCashier = sale.cashier?.trim() || 'Sin asignar';
      const originalCashierUserId =
        sale.cashierUserId ??
        usersByName.get(originalCashier.toLowerCase()) ??
        null;

      for (const item of sale.items) {
        const returnedQty = item.returnedQuantity ?? 0;
        const remainingQty = item.quantity - returnedQty;
        if (remainingQty <= 0) continue;
        const product = productById.get(item.productId);
        rows.push({
          key: `${sale.id}-${item.id}`,
          sale,
          item,
          barcode: product?.barcode ?? null,
          soldQty: item.quantity,
          returnedQty,
          remainingQty,
          originalCashier,
          originalCashierUserId,
        });
      }
    }
    return rows.sort(
      (a, b) => new Date(b.sale.createdAt).getTime() - new Date(a.sale.createdAt).getTime(),
    );
  }, [sales, productById, usersByName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return returnableLines.slice(0, 80);
    return returnableLines
      .filter((row) => {
        const name = row.item.productName.toLowerCase();
        const invoice = row.sale.invoiceNumber.toLowerCase();
        const barcode = (row.barcode ?? '').toLowerCase();
        const sku = (productById.get(row.item.productId)?.sku ?? '').toLowerCase();
        return (
          name.includes(q) ||
          invoice.includes(q) ||
          barcode.includes(q) ||
          sku.includes(q)
        );
      })
      .slice(0, 100);
  }, [query, returnableLines, productById]);

  const recentReturns = listCustomerReturns().slice(0, 10);

  const openProcess = (row: ReturnableLine) => {
    setSelected(row);
    setQty(String(row.remainingQty));
    setReason('customer_request');
    setReasonNotes('');
  };

  const refundPreview = useMemo(() => {
    if (!selected) return 0;
    const n = Math.min(
      selected.remainingQty,
      Math.max(0, Math.floor(Number(qty) || 0)),
    );
    return n * selected.item.unitPrice;
  }, [selected, qty]);

  const handleProcess = () => {
    if (!user || !selected) {
      toast.error('Sesión no válida');
      return;
    }
    const returnQty = Math.floor(Number(qty) || 0);
    if (returnQty <= 0) {
      toast.error('Indica una cantidad válida');
      return;
    }
    if (returnQty > selected.remainingQty) {
      toast.error(`Solo puedes devolver hasta ${selected.remainingQty}`);
      return;
    }

    setSaving(true);
    try {
      const result = createCustomerReturn({
        saleId: selected.sale.id,
        reason,
        reasonNotes: reasonNotes.trim() || undefined,
        refundMethod: 'cash',
        processedBy: user.username,
        processedByUserId: user.id,
        originalCashierUserId: selected.originalCashierUserId,
        items: [{ saleItemId: selected.item.id, quantity: returnQty }],
      });
      toast.success(
        `Devolución procesada · ${formatCOP(result.refundTotal)} · caja −${formatCOP(result.refundCashAmount)}`,
      );
      setSelected(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar la devolución');
    } finally {
      setSaving(false);
    }
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
              Busca por producto, código de barras o factura. Procesar la devolución restaura stock y
              descuenta el reembolso en efectivo del cierre de caja.
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
                placeholder="Buscar producto, código de barras o N° de factura..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Mostrando artículos con unidades pendientes de devolución
              {user ? (
                <>
                  {' '}
                  · Devuelto por:{' '}
                  <span className="font-medium text-slate-700">{user.username}</span>
                </>
              ) : null}
            </p>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Fecha de venta</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Vendido por</TableHead>
                <TableHead className="text-right">P. venta</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="text-right">Pendientes</TableHead>
                <TableHead className="w-[150px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No hay artículos pendientes que coincidan con la búsqueda.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.key} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.item.productName}</div>
                      {row.barcode && (
                        <div className="text-xs text-slate-500 font-mono">{row.barcode}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(row.sale.createdAt), 'd MMM yyyy, h:mm a', { locale: es })}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.sale.invoiceNumber}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <UserRound className="w-3.5 h-3.5 text-slate-400" />
                        {row.originalCashier}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCOP(row.item.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{row.soldQty}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-amber-800">
                      {row.remainingQty}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                        onClick={() => openProcess(row)}
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Devolver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {recentReturns.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Últimas devoluciones (auditoría)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentReturns.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-slate-100 px-3 py-2.5 text-sm flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div>
                      <span className="font-medium">{r.items.map((i) => i.productName).join(', ')}</span>
                      <span className="text-slate-500"> · {r.invoiceNumber}</span>
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        Vendido por:{' '}
                        <span className="text-slate-700 font-medium">
                          {r.originalCashier || 'Sin asignar'}
                          {r.originalCashierUserId != null ? ` (#${r.originalCashierUserId})` : ''}
                        </span>
                      </span>
                      <span>
                        Devuelto por:{' '}
                        <span className="text-slate-700 font-medium">
                          {r.processedBy} (#{r.processedByUserId})
                        </span>
                      </span>
                      <span>
                        {format(new Date(r.createdAt), 'd MMM, h:mm a', { locale: es })} ·{' '}
                        {RETURN_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">{formatCOP(r.refundTotal)}</div>
                    {r.refundCashAmount > 0 && (
                      <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-800">
                        Caja −{formatCOP(r.refundCashAmount)}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Procesar devolución</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="font-semibold text-slate-900">{selected.item.productName}</div>
                <div className="text-xs text-slate-500 font-mono">{selected.sale.invoiceNumber}</div>
                <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      Vendido por
                    </div>
                    <div className="font-medium text-slate-800 mt-0.5">
                      {selected.originalCashier}
                      {selected.originalCashierUserId != null
                        ? ` · #${selected.originalCashierUserId}`
                        : ''}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      Devuelto por
                    </div>
                    <div className="font-medium text-slate-800 mt-0.5">
                      {user?.username ?? '—'}
                      {user ? ` · #${user.id}` : ''}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-slate-600 flex justify-between pt-1">
                  <span>Precio de venta</span>
                  <span className="font-mono font-semibold">{formatCOP(selected.item.unitPrice)}</span>
                </div>
                <div className="text-sm text-slate-600 flex justify-between">
                  <span>Pendientes</span>
                  <span className="font-mono font-semibold">{selected.remainingQty}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Cantidad a devolver</Label>
                  <Input
                    type="number"
                    min={1}
                    max={selected.remainingQty}
                    className="font-mono"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo</Label>
                  <Select
                    value={reason}
                    onValueChange={(v) => setReason(v as CustomerReturnReason)}
                  >
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
              </div>

              <div className="space-y-1.5">
                <Label>Notas (opcional)</Label>
                <Textarea
                  rows={2}
                  value={reasonNotes}
                  onChange={(e) => setReasonNotes(e.target.value)}
                  placeholder="Detalle adicional..."
                />
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm flex justify-between">
                <span className="text-amber-900">Reembolso en efectivo (caja)</span>
                <span className="font-mono font-bold text-amber-950">
                  −{formatCOP(refundPreview)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={saving || refundPreview <= 0}
              onClick={handleProcess}
            >
              {saving ? 'Procesando...' : 'Procesar Devolución'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
