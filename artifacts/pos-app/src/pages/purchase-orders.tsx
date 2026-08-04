import { useMemo, useState } from 'react';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import { formatCOP } from '@/lib/currency';
import { toDateKey } from '@/lib/date';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, PackagePlus, Eye } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseOrder } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';

type LineDraft = {
  key: string;
  productId: string;
  quantity: string;
  unitCost: string;
};

function emptyLine(): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: '',
    quantity: '1',
    unitCost: '',
  };
}

export default function PurchaseOrders() {
  const { products, listPurchaseOrders, createPurchaseOrder } = useData();
  const { user } = useAuth();
  const orders = listPurchaseOrders();

  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [saving, setSaving] = useState(false);

  const [supplierName, setSupplierName] = useState('');
  const [supplierNit, setSupplierNit] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => toDateKey());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const productMap = useMemo(() => {
    const m = new Map(products.map((p) => [p.id, p]));
    return m;
  }, [products]);

  const liveTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = Math.floor(Number(line.quantity)) || 0;
      const cost = Math.round(Number(line.unitCost)) || 0;
      return sum + qty * cost;
    }, 0);
  }, [lines]);

  const resetForm = () => {
    setSupplierName('');
    setSupplierNit('');
    setInvoiceNumber('');
    setPurchaseDate(toDateKey());
    setNotes('');
    setLines([emptyLine()]);
  };

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const handleSelectProduct = (key: string, productId: string) => {
    const product = productMap.get(Number(productId));
    updateLine(key, {
      productId,
      unitCost:
        product?.cost != null && product.cost > 0
          ? String(product.cost)
          : '',
    });
  };

  const handleSave = () => {
    if (!user) {
      toast.error('Sesión no válida');
      return;
    }
    const items = lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: Number(l.productId),
        quantity: Math.floor(Number(l.quantity)),
        unitCost: Math.round(Number(l.unitCost)),
      }));

    setSaving(true);
    try {
      const order = createPurchaseOrder({
        supplierName,
        supplierNit,
        invoiceNumber,
        purchaseDate,
        notes,
        createdBy: user.username,
        createdByUserId: user.id,
        items,
      });
      toast.success(
        `Carga #${order.id} registrada · ${formatCOP(order.totalAmount)} · stock y costos actualizados`,
      );
      setFormOpen(false);
      resetForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al registrar la carga';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Cargas de Inventario
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Órdenes de compra con actualización de cantidad y costo promedio ponderado.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setFormOpen(true);
          }}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
        >
          <Plus className="w-4 h-4" /> Nueva carga
        </Button>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Nº Factura</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ítems</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                    No hay cargas de inventario registradas aún.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-blue-50/40">
                    <TableCell className="font-mono text-sm text-slate-600 whitespace-nowrap">
                      {format(
                        new Date(order.purchaseDate + 'T12:00:00'),
                        'd MMM yyyy',
                        { locale: es },
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{order.supplierName}</div>
                      {order.supplierNit ? (
                        <div className="text-xs text-slate-500 font-mono">
                          NIT {order.supplierNit}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{order.invoiceNumber}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-slate-900">
                      {formatCOP(order.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {order.items.length} · {order.itemCount} uds
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-amber-500 text-slate-900 border-0 capitalize">
                        {order.status === 'completed' ? 'Completada' : order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Ver detalle"
                        onClick={() => setDetail(order)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <PackagePlus className="w-5 h-5 text-blue-600" />
              Nueva carga de inventario
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[60vh] pr-3">
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="supplier">Proveedor / Nombre *</Label>
                  <Input
                    id="supplier"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nit">NIT</Label>
                  <Input
                    id="nit"
                    value={supplierNit}
                    onChange={(e) => setSupplierNit(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice">Nº factura de compra *</Label>
                  <Input
                    id="invoice"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="FAC-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Fecha de compra *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observaciones de la compra…"
                    rows={2}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900">Productos comprados *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setLines((prev) => [...prev, emptyLine()])}
                  >
                    <Plus className="w-3.5 h-3.5" /> Línea
                  </Button>
                </div>

                <div className="space-y-2">
                  {lines.map((line) => {
                    const product = line.productId
                      ? productMap.get(Number(line.productId))
                      : undefined;
                    const qty = Math.floor(Number(line.quantity)) || 0;
                    const cost = Math.round(Number(line.unitCost)) || 0;
                    const lineTotal = qty * cost;
                    return (
                      <div
                        key={line.key}
                        className="grid grid-cols-12 gap-2 items-end rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                      >
                        <div className="col-span-12 sm:col-span-5 space-y-1">
                          <span className="text-[11px] text-slate-500">Producto</span>
                          <Select
                            value={line.productId || undefined}
                            onValueChange={(v) => handleSelectProduct(line.key, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar…" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name} · {p.sku}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {product ? (
                            <p className="text-[11px] text-slate-500 font-mono">
                              Stock {product.stockQuantity} · Costo actual{' '}
                              {product.cost != null ? formatCOP(product.cost) : '—'}
                            </p>
                          ) : null}
                        </div>
                        <div className="col-span-4 sm:col-span-2 space-y-1">
                          <span className="text-[11px] text-slate-500">Cantidad</span>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, { quantity: e.target.value })
                            }
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-3 space-y-1">
                          <span className="text-[11px] text-slate-500">Costo unitario</span>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={line.unitCost}
                            onChange={(e) =>
                              updateLine(line.key, { unitCost: e.target.value })
                            }
                            placeholder="0"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex items-center justify-end pb-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            disabled={lines.length <= 1}
                            onClick={() =>
                              setLines((prev) => prev.filter((l) => l.key !== line.key))
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="col-span-12 text-right text-xs font-mono text-slate-600">
                          Subtotal: {formatCOP(lineTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-blue-800">Total de la compra</span>
                <span className="text-xl font-bold font-mono text-blue-950">
                  {formatCOP(liveTotal)}
                </span>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {saving ? 'Guardando…' : 'Confirmar carga'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de carga #{detail?.id}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Proveedor</div>
                  <div className="font-medium text-slate-900">{detail.supplierName}</div>
                  {detail.supplierNit ? (
                    <div className="text-xs font-mono text-slate-500">
                      NIT {detail.supplierNit}
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs text-slate-500">Factura</div>
                  <div className="font-mono font-medium">{detail.invoiceNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Fecha compra</div>
                  <div>
                    {format(new Date(detail.purchaseDate + 'T12:00:00'), 'd MMM yyyy', {
                      locale: es,
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Total</div>
                  <div className="font-mono font-bold">{formatCOP(detail.totalAmount)}</div>
                </div>
              </div>
              {detail.notes ? (
                <p className="text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  {detail.notes}
                </p>
              ) : null}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Nuevo costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((item) => (
                      <TableRow key={`${detail.id}-${item.productId}`}>
                        <TableCell>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-[11px] font-mono text-slate-500">{item.sku}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">+{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCOP(item.unitCost)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-700 font-semibold">
                          {formatCOP(item.newCost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-slate-500">
                Registrado por {detail.createdBy} ·{' '}
                {format(new Date(detail.createdAt), "d MMM yyyy, h:mm a", { locale: es })}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetail(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
