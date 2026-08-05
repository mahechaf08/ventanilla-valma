import { useMemo, useState } from 'react';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import { formatCOP } from '@/lib/currency';
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
import { Plus, Trash2, Undo2, Eye, Banknote, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { SupplierReturn, SupplierReturnSettlement } from '@/types';
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

export default function SupplierReturns() {
  const { products, listSupplierReturns, createSupplierReturn } = useData();
  const { user } = useAuth();
  const returns = listSupplierReturns();

  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<SupplierReturn | null>(null);
  const [saving, setSaving] = useState(false);

  const [supplierName, setSupplierName] = useState('');
  const [supplierNit, setSupplierNit] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [settlement, setSettlement] = useState<SupplierReturnSettlement>('store_credit');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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
    setReferenceNumber('');
    setSettlement('store_credit');
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
        product?.cost != null && product.cost > 0 ? String(product.cost) : '',
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
      const record = createSupplierReturn({
        supplierName,
        supplierNit,
        referenceNumber,
        settlement,
        notes,
        createdBy: user.username,
        createdByUserId: user.id,
        items,
      });
      toast.success(
        `Devolución #${record.id} · ${formatCOP(record.totalAmount)}${
          record.settlement === 'cash_refund'
            ? ' · reembolso en efectivo a caja'
            : ' · crédito / ajuste (sin impacto en caja)'
        }`,
      );
      setFormOpen(false);
      resetForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar la devolución');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Devolución a Proveedores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Descuenta stock y registra reembolso en efectivo o crédito de proveedor.
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          onClick={() => setFormOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Nueva devolución
        </Button>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Liquidación</TableHead>
                <TableHead className="text-right">Ítems</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Aún no hay devoluciones a proveedores.
                  </TableCell>
                </TableRow>
              ) : (
                returns.map((row) => (
                  <TableRow key={row.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono">{row.id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(row.createdAt), 'd MMM yyyy, h:mm a', { locale: es })}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.supplierName}</div>
                      {row.referenceNumber && (
                        <div className="text-xs text-slate-500">Ref {row.referenceNumber}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.settlement === 'cash_refund'
                            ? 'border-blue-200 bg-blue-50 text-blue-800'
                            : 'border-slate-200'
                        }
                      >
                        {row.settlement === 'cash_refund' ? (
                          <span className="inline-flex items-center gap-1">
                            <Banknote className="w-3 h-3" /> Efectivo a caja
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Wallet className="w-3 h-3" /> Crédito / ajuste
                          </span>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{row.itemCount}</TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCOP(row.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDetail(row)}
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

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-blue-600" />
              Devolución a proveedor
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-3">
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Proveedor</Label>
                  <Input
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>NIT (opcional)</Label>
                  <Input value={supplierNit} onChange={(e) => setSupplierNit(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Referencia / nota (opcional)</Label>
                  <Input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Número de nota crédito"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Tipo de liquidación</Label>
                  <Select
                    value={settlement}
                    onValueChange={(v) => setSettlement(v as SupplierReturnSettlement)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="store_credit">
                        Crédito / ajuste de saldo (sin movimiento de caja)
                      </SelectItem>
                      <SelectItem value="cash_refund">
                        Reembolso en efectivo (entra a caja)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {settlement === 'cash_refund' && (
                    <p className="text-xs text-blue-700 mt-1">
                      El valor total se sumará al efectivo esperado del cierre de caja.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Productos a devolver</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLines((prev) => [...prev, emptyLine()])}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Línea
                  </Button>
                </div>
                {lines.map((line) => {
                  const product = productMap.get(Number(line.productId));
                  return (
                    <div
                      key={line.key}
                      className="grid grid-cols-12 gap-2 items-end rounded-lg border border-slate-200 p-2"
                    >
                      <div className="col-span-12 sm:col-span-5 space-y-1">
                        <Label className="text-xs">Producto</Label>
                        <Select
                          value={line.productId}
                          onValueChange={(v) => handleSelectProduct(line.key, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name} · stock {p.stockQuantity}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {product && (
                          <p className="text-[11px] text-slate-500">
                            Stock actual: {product.stockQuantity}
                          </p>
                        )}
                      </div>
                      <div className="col-span-4 sm:col-span-2 space-y-1">
                        <Label className="text-xs">Cant.</Label>
                        <Input
                          type="number"
                          min="1"
                          className="font-mono"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-3 space-y-1">
                        <Label className="text-xs">Costo unit.</Label>
                        <Input
                          type="number"
                          min="0"
                          className="font-mono"
                          value={line.unitCost}
                          onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          disabled={lines.length <= 1}
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Motivo de la devolución..."
                />
              </div>

              <div className="flex justify-between items-center rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-600">Total estimado</span>
                <span className="font-mono font-bold text-lg">{formatCOP(liveTotal)}</span>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Guardando...' : 'Registrar devolución'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Detalle devolución #{detail?.id}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-slate-500">Proveedor</div>
                  <div className="font-medium">{detail.supplierName}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Liquidación</div>
                  <div className="font-medium">
                    {detail.settlement === 'cash_refund' ? 'Efectivo a caja' : 'Crédito / ajuste'}
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell>
                        <div>{item.productName}</div>
                        <div className="text-xs text-slate-500">
                          Stock {item.previousStock} → {item.newStock}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCOP(item.unitCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCOP(item.lineTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between font-bold pt-2 border-t">
                <span>Total</span>
                <span className="font-mono">{formatCOP(detail.totalAmount)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
