import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useData } from '@/contexts/data-context';
import { formatCOP } from '@/lib/currency';
import type { Product, SupplierInvoicePayment } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Building2,
  FileSpreadsheet,
  Minus,
  PackagePlus,
  Plus,
  Receipt,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface StockLine {
  product: Product;
  quantity: number;
}

function PaymentForm({ onPaid }: { onPaid?: () => void }) {
  const { user } = useAuth();
  const { paySupplierInvoice } = useData();
  const [supplierName, setSupplierName] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const value = parseFloat(amount);
    if (!supplierName.trim()) {
      toast.error('Ingresa el nombre del proveedor');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Ingresa un valor de factura válido');
      return;
    }

    setSaving(true);
    try {
      paySupplierInvoice({
        supplierName: supplierName.trim(),
        amount: value,
        employeeId: user.id,
        employeeName: user.username,
      });
      toast.success(`Pago registrado · ${formatCOP(value)} a ${supplierName.trim()}`);
      setSupplierName('');
      setAmount('');
      onPaid?.();
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl rounded-xl px-4 py-3 text-sm text-muted-foreground">
        El pago quedará a nombre de{' '}
        <strong className="text-foreground">{user?.username}</strong> y se registrará
        como salida de caja de la sesión actual.
      </div>

      <div className="space-y-2">
        <Label htmlFor="supplier-name">Nombre del proveedor *</Label>
        <Input
          id="supplier-name"
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
          placeholder="ej: Proveedor Café Andes"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invoice-amount">Valor de la factura (COP) *</Label>
        <Input
          id="invoice-amount"
          type="number"
          min="1"
          step="100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="ej: 150000"
          className="font-mono"
        />
      </div>

      <Button
        type="submit"
        disabled={saving}
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 gap-2"
      >
        <Wallet className="w-4 h-4" />
        {saving ? 'Registrando...' : 'Registrar pago de factura'}
      </Button>
    </form>
  );
}

export default function SupplierInvoicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const {
    listSupplierInvoices,
    getSupplierAccountSummaries,
    listProducts,
    receiveSupplierStock,
  } = useData();

  const invoices = listSupplierInvoices();
  const accounts = getSupplierAccountSummaries();
  const products = listProducts();

  const [receiveTarget, setReceiveTarget] = useState<SupplierInvoicePayment | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [stockLines, setStockLines] = useState<StockLine[]>([]);
  const [stockNotes, setStockNotes] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [products, productSearch]);

  const openReceive = (invoice: SupplierInvoicePayment) => {
    setReceiveTarget(invoice);
    setStockLines([]);
    setStockNotes('');
    setProductSearch('');
  };

  const addStockLine = (product: Product) => {
    setStockLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateStockQty = (productId: number, delta: number) => {
    setStockLines((prev) =>
      prev
        .map((l) =>
          l.product.id === productId
            ? { ...l, quantity: Math.max(0, l.quantity + delta) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  const handleReceiveStock = () => {
    if (!receiveTarget || !user) return;
    if (!stockLines.length) {
      toast.error('Agrega productos recibidos');
      return;
    }
    setReceiving(true);
    try {
      receiveSupplierStock({
        invoiceId: receiveTarget.id,
        receivedBy: user.username,
        notes: stockNotes,
        items: stockLines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
        })),
      });
      toast.success(`Cantidad recibida de ${receiveTarget.supplierName}`);
      setReceiveTarget(null);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Error al recibir cantidad');
    } finally {
      setReceiving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Receipt className="w-6 h-6 text-blue-600" />
              Pago de Facturas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Registra el pago de una factura de proveedor a tu nombre. No puedes ver
              totales ni pagos de otros cajeros.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <PaymentForm />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="w-6 h-6 text-blue-600" />
          Pago de Facturas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registra pagos a proveedores, consulta el historial y recibe inventario contra facturas.
        </p>
      </div>

      <Tabs defaultValue="pay" className="flex-1 flex flex-col min-h-0">
        <div className="px-6 pt-4 flex-shrink-0">
          <TabsList>
            <TabsTrigger value="pay" className="gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Registrar pago
            </TabsTrigger>
            <TabsTrigger value="control" className="gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Control de Proveedores
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pay" className="flex-1 overflow-y-auto p-6 mt-0">
          <div className="max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <PaymentForm onPaid={refresh} />
          </div>
        </TabsContent>

        <TabsContent value="control" className="flex-1 min-h-0 mt-0 overflow-y-auto p-6 space-y-8">
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-teal-700" />
              Cuentas de proveedores
            </h2>
            <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Pagos</TableHead>
                    <TableHead className="text-right">Total pagado</TableHead>
                    <TableHead className="text-right">Pend. cantidad</TableHead>
                    <TableHead>Último pago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        Aún no hay pagos a proveedores.
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((acc) => (
                      <TableRow key={acc.supplierName}>
                        <TableCell className="font-medium">{acc.supplierName}</TableCell>
                        <TableCell className="text-right font-mono">{acc.paymentCount}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCOP(acc.totalPaid)}
                        </TableCell>
                        <TableCell className="text-right">
                          {acc.pendingStockCount > 0 ? (
                            <Badge className="bg-amber-100 text-amber-800 border-0">
                              {acc.pendingStockCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(acc.lastPaymentAt), "d MMM yyyy, h:mm a", { locale: es })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Log de transacciones</h2>
            <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow>
                    <TableHead>Fecha / hora</TableHead>
                    <TableHead>Empleado que pagó</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Estado cantidad</TableHead>
                    <TableHead className="w-[140px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No hay facturas registradas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap font-mono">
                          {format(new Date(inv.createdAt), "d MMM yyyy · h:mm a", { locale: es })}
                        </TableCell>
                        <TableCell className="font-medium">{inv.paidByEmployeeName}</TableCell>
                        <TableCell>{inv.supplierName}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-red-700">
                          −{formatCOP(inv.amount)}
                        </TableCell>
                        <TableCell>
                          {inv.status === 'pending_stock' ? (
                            <Badge className="bg-amber-100 text-amber-800 border-0">
                              Pendiente recepción
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500 text-slate-900 border-0">
                              Cantidad recibida
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {inv.status === 'pending_stock' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => openReceive(inv)}
                            >
                              <PackagePlus className="w-3.5 h-3.5" />
                              Recibir cantidad
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {inv.stockReceivedBy
                                ? `Por ${inv.stockReceivedBy}`
                                : 'Completado'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={!!receiveTarget} onOpenChange={(open) => !open && setReceiveTarget(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-blue-600" />
              Recibir cantidad · {receiveTarget?.supplierName}
            </DialogTitle>
          </DialogHeader>
          {receiveTarget && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                Factura pagada por <strong>{receiveTarget.paidByEmployeeName}</strong>
                {' · '}
                <span className="font-mono">{formatCOP(receiveTarget.amount)}</span>
                {' · '}
                {format(new Date(receiveTarget.createdAt), "d MMM yyyy, h:mm a", { locale: es })}
              </div>

              <div className="space-y-2">
                <Label>Buscar producto a ingresar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Nombre o SKU..."
                    className="pl-9"
                  />
                </div>
                <div className="border rounded-md max-h-36 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3 text-center">Sin resultados</p>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addStockLine(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between gap-2 border-b last:border-0"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground font-mono shrink-0">{p.sku}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {stockLines.length > 0 && (
                <div className="border rounded-md divide-y">
                  {stockLines.map((line) => (
                    <div key={line.product.id} className="flex items-center justify-between px-3 py-2 gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{line.product.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{line.product.sku}</div>
                      </div>
                      <div className="flex items-center gap-1 bg-slate-100 rounded-md p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateStockQty(line.product.id, -1)}
                        >
                          {line.quantity === 1 ? (
                            <Trash2 className="w-3 h-3 text-destructive" />
                          ) : (
                            <Minus className="w-3 h-3" />
                          )}
                        </Button>
                        <span className="w-7 text-center font-mono text-sm">{line.quantity}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateStockQty(line.product.id, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="stock-notes">Notas (opcional)</Label>
                <Textarea
                  id="stock-notes"
                  value={stockNotes}
                  onChange={(e) => setStockNotes(e.target.value)}
                  placeholder="Nº remisión, observaciones..."
                  className="resize-none h-20"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveTarget(null)}>Cancelar</Button>
            <Button
              onClick={handleReceiveStock}
              disabled={receiving || stockLines.length === 0}
              className="bg-blue-600 hover:bg-blue-700 gap-1.5"
            >
              <PackagePlus className="w-4 h-4" />
              {receiving ? 'Guardando...' : 'Confirmar recepción'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
