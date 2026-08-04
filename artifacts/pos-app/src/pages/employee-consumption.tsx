import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useData } from '@/contexts/data-context';
import { formatCOP } from '@/lib/currency';
import type { EmployeeConsumptionSummary, PaymentMethod, Sale, User as AppUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Banknote,
  Coffee,
  CreditCard,
  FileText,
  History,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const metodoPago: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  transfer: 'Transferencia',
  other: 'Otro / nómina',
};

type EmployeeRow = {
  employeeId: number;
  employeeName: string;
  role: AppUser['role'] | null;
  summary: EmployeeConsumptionSummary | null;
};

export default function EmployeeConsumptionAdmin() {
  const { user, listUsers } = useAuth();
  const {
    getEmployeeConsumptionSummaries,
    getLiquidatedBatches,
    liquidateEmployeeAccount,
  } = useData();

  const users = listUsers();
  const summaries = getEmployeeConsumptionSummaries();
  const liquidatedBatches = getLiquidatedBatches();

  const summaryById = useMemo(() => {
    const map = new Map<number, EmployeeConsumptionSummary>();
    for (const s of summaries) map.set(s.employeeId, s);
    return map;
  }, [summaries]);

  const employeeRows: EmployeeRow[] = useMemo(() => {
    const rows: EmployeeRow[] = users.map((u) => ({
      employeeId: u.id,
      employeeName: u.username,
      role: u.role,
      summary: summaryById.get(u.id) ?? null,
    }));

    for (const s of summaries) {
      if (!rows.some((r) => r.employeeId === s.employeeId)) {
        rows.push({
          employeeId: s.employeeId,
          employeeName: s.employeeName,
          role: null,
          summary: s,
        });
      }
    }

    return rows.sort((a, b) => {
      const balA = a.summary?.totalAmount ?? 0;
      const balB = b.summary?.totalAmount ?? 0;
      if (balB !== balA) return balB - balA;
      return a.employeeName.localeCompare(b.employeeName, 'es');
    });
  }, [users, summaries, summaryById]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [liquidateTarget, setLiquidateTarget] = useState<EmployeeRow | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('other');
  const [liquidating, setLiquidating] = useState(false);
  const [invoiceSale, setInvoiceSale] = useState<Sale | null>(null);
  const [historySaleId, setHistorySaleId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedId == null && employeeRows.length > 0) {
      const firstWithBalance = employeeRows.find((r) => (r.summary?.totalAmount ?? 0) > 0);
      setSelectedId((firstWithBalance ?? employeeRows[0]).employeeId);
      return;
    }
    if (selectedId != null && !employeeRows.some((r) => r.employeeId === selectedId)) {
      setSelectedId(employeeRows[0]?.employeeId ?? null);
    }
  }, [employeeRows, selectedId]);

  const selected = employeeRows.find((r) => r.employeeId === selectedId) ?? null;
  const selectedSummary = selected?.summary ?? null;
  const historyBatch = liquidatedBatches.find((b) => b.saleId === historySaleId) ?? null;

  const grandTotal = useMemo(
    () => summaries.reduce((s, row) => s + row.totalAmount, 0),
    [summaries],
  );

  const resolveEmployeeName = (row: EmployeeRow) => row.employeeName;

  const handleLiquidate = () => {
    if (!liquidateTarget?.summary || !user) return;
    setLiquidating(true);
    try {
      const name = resolveEmployeeName(liquidateTarget);
      const sale = liquidateEmployeeAccount({
        employeeId: liquidateTarget.employeeId,
        employeeName: name,
        paymentMethod,
        liquidatedBy: user.username,
      });
      setLiquidateTarget(null);
      setInvoiceSale(sale);
      toast.success(`Cuenta de ${name} liquidada · saldo en $0`);
    } catch (err: any) {
      toast.error(err?.message || 'Error al liquidar la cuenta');
    } finally {
      setLiquidating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0 print:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Coffee className="w-6 h-6 text-amber-600" />
              Historial y resumen de consumo
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Revisa el saldo acumulado de cada empleado y liquida cuando quieras
              (fin de periodo, renuncia, cobro parcial, etc.).
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Pendiente total</div>
            <div className="text-2xl font-mono font-bold text-amber-800">{formatCOP(grandTotal)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {summaries.length} con saldo · {users.length} empleados
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="pending" className="flex-1 flex flex-col min-h-0 print:hidden">
        <div className="px-6 pt-4 flex-shrink-0">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Pendiente
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="w-3.5 h-3.5" />
              Historial liquidado
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pending" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <div className="flex h-full min-h-0 border-t">
            <aside className="w-80 border-r border-slate-200 flex flex-col min-h-0 bg-slate-50">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Users className="w-4 h-4" />
                Empleados
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {employeeRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">
                      No hay empleados registrados.
                    </p>
                  ) : (
                    employeeRows.map((row) => {
                      const balance = row.summary?.totalAmount ?? 0;
                      const active = selectedId === row.employeeId;
                      return (
                        <button
                          key={row.employeeId}
                          type="button"
                          onClick={() => setSelectedId(row.employeeId)}
                          className={cn(
                            'w-full text-left rounded-xl px-3 py-2.5 transition-all border',
                            active
                              ? 'bg-white border border-amber-300 rounded-xl shadow-sm'
                              : 'border-transparent hover:bg-slate-50',
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0',
                                balance > 0 ? 'bg-amber-600' : 'bg-slate-400',
                              )}
                            >
                              {row.employeeName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">{row.employeeName}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.role === 'admin'
                                  ? 'Administrador'
                                  : row.role === 'user'
                                    ? 'Cajero'
                                    : 'Cuenta histórica'}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div
                                className={cn(
                                  'font-mono text-sm font-semibold',
                                  balance > 0 ? 'text-amber-800' : 'text-muted-foreground',
                                )}
                              >
                                {formatCOP(balance)}
                              </div>
                              {balance > 0 && (
                                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 mt-0.5 inline-flex">
                                  pendiente
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </aside>

            <section className="flex-1 flex flex-col min-h-0 min-w-0">
              {!selected ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Selecciona un empleado para ver el detalle.
                </div>
              ) : (
                <>
                  <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 flex-shrink-0 bg-white">
                    <div>
                      <h2 className="text-lg font-bold tracking-tight">{selected.employeeName}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Ítems activos sin liquidar · saldo acumulado en tiempo real
                      </p>
                    </div>
                    <div className="text-right space-y-2">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase">Saldo pendiente</div>
                        <div className="text-2xl font-mono font-bold text-amber-800">
                          {formatCOP(selectedSummary?.totalAmount ?? 0)}
                        </div>
                      </div>
                      <Button
                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                        disabled={!selectedSummary || selectedSummary.totalAmount <= 0}
                        onClick={() => {
                          setPaymentMethod('other');
                          setLiquidateTarget(selected);
                        }}
                      >
                        <FileText className="w-4 h-4" />
                        Liquidar Cuenta / Convertir a Venta
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="flex-1">
                    <div className="p-6">
                      {!selectedSummary || selectedSummary.items.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm rounded-xl border-dashed p-12 text-center text-muted-foreground">
                          <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                          <p className="font-medium text-foreground">Saldo en $0</p>
                          <p className="text-sm mt-1">
                            Este empleado no tiene consumo pendiente por liquidar.
                          </p>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-slate-50">
                              <TableRow>
                                <TableHead>Fecha y hora</TableHead>
                                <TableHead>Producto</TableHead>
                                <TableHead className="text-right">Cantidad</TableHead>
                                <TableHead className="text-right">Precio unit.</TableHead>
                                <TableHead className="text-right">Subtotal</TableHead>
                                <TableHead>Registró</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedSummary.items.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap font-mono">
                                    {format(new Date(item.createdAt), "d MMM yyyy · h:mm a", {
                                      locale: es,
                                    })}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{item.productName}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Cuenta: {item.employeeName}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-semibold">
                                    {item.quantity}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-muted-foreground">
                                    {formatCOP(item.unitPrice)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-medium">
                                    {formatCOP(item.subtotal)}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {item.registeredBy}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div className="flex justify-between items-center px-4 py-3 bg-amber-50 border-t">
                            <span className="text-sm text-amber-900">
                              {selectedSummary.totalQuantity} unidad
                              {selectedSummary.totalQuantity !== 1 ? 'es' : ''} ·{' '}
                              {selectedSummary.items.length} registro
                              {selectedSummary.items.length !== 1 ? 's' : ''}
                            </span>
                            <span className="font-mono font-bold text-amber-900 text-lg">
                              Total a liquidar: {formatCOP(selectedSummary.totalAmount)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 min-h-0 mt-0 p-6 data-[state=inactive]:hidden overflow-auto">
          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead>Fecha liquidación</TableHead>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidatedBatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-14 text-muted-foreground">
                      Aún no hay liquidaciones registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  liquidatedBatches.map((batch) => (
                    <TableRow key={batch.saleId}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(batch.liquidatedAt), "d MMM yyyy, h:mm a", { locale: es })}
                      </TableCell>
                      <TableCell className="font-medium">{batch.employeeName}</TableCell>
                      <TableCell className="font-mono text-sm">{batch.invoiceNumber}</TableCell>
                      <TableCell className="text-right font-mono">{batch.totalQuantity}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-blue-700">
                        {formatCOP(batch.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setHistorySaleId(batch.saleId)}
                        >
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={!!liquidateTarget}
        onOpenChange={(open) => !open && setLiquidateTarget(null)}
      >
        <AlertDialogContent className="sm:max-w-[460px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Liquidar Cuenta / Convertir a Venta</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Se convertirán <strong className="text-foreground">todos</strong> los ítems
                  pendientes de{' '}
                  <strong className="text-foreground">
                    {liquidateTarget ? resolveEmployeeName(liquidateTarget) : ''}
                  </strong>{' '}
                  (
                  {formatCOP(liquidateTarget?.summary?.totalAmount ?? 0)}
                  ) en una venta oficial. El saldo quedará en{' '}
                  <strong className="text-foreground">$0</strong> de inmediato.
                </p>
                <div className="space-y-2 pt-1">
                  <Label className="text-foreground">Método de cobro / descuento</Label>
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                    className="grid grid-cols-3 gap-2"
                  >
                    <Label
                      className={`flex flex-col items-center gap-1 rounded-md border-2 p-3 cursor-pointer ${paymentMethod === 'other' ? 'border-primary bg-primary/5' : 'border-muted'}`}
                    >
                      <RadioGroupItem value="other" className="sr-only" />
                      <User className="w-4 h-4" />
                      <span className="text-xs">Nómina</span>
                    </Label>
                    <Label
                      className={`flex flex-col items-center gap-1 rounded-md border-2 p-3 cursor-pointer ${paymentMethod === 'cash' ? 'border-primary bg-primary/5' : 'border-muted'}`}
                    >
                      <RadioGroupItem value="cash" className="sr-only" />
                      <Banknote className="w-4 h-4" />
                      <span className="text-xs">Efectivo</span>
                    </Label>
                    <Label
                      className={`flex flex-col items-center gap-1 rounded-md border-2 p-3 cursor-pointer ${paymentMethod === 'card' ? 'border-primary bg-primary/5' : 'border-muted'}`}
                    >
                      <RadioGroupItem value="card" className="sr-only" />
                      <CreditCard className="w-4 h-4" />
                      <span className="text-xs">Tarjeta</span>
                    </Label>
                  </RadioGroup>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLiquidate}
              disabled={liquidating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {liquidating ? 'Liquidando...' : 'Liquidar y generar factura'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!invoiceSale} onOpenChange={(open) => !open && setInvoiceSale(null)}>
        <DialogContent className="sm:max-w-[420px] print:shadow-none print:border-0">
          <DialogHeader className="print:hidden">
            <DialogTitle className="text-center">Factura de liquidación</DialogTitle>
          </DialogHeader>
          {invoiceSale && <InvoiceBody sale={invoiceSale} />}
          <DialogFooter className="sm:justify-center gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>Imprimir</Button>
            <Button onClick={() => setInvoiceSale(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyBatch} onOpenChange={(open) => !open && setHistorySaleId(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Detalle de liquidación</DialogTitle>
          </DialogHeader>
          {historyBatch && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Empleado</div>
                  <div className="font-medium">{historyBatch.employeeName}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Factura</div>
                  <div className="font-mono font-medium">{historyBatch.invoiceNumber}</div>
                </div>
              </div>
              <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50">
                    <TableRow>
                      <TableHead>Fecha consumo</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyBatch.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(item.createdAt), "d MMM, h:mm a", { locale: es })}
                        </TableCell>
                        <TableCell className="text-sm">{item.productName}</TableCell>
                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono">{formatCOP(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total liquidado</span>
                <span className="font-mono text-blue-700">{formatCOP(historyBatch.totalAmount)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setHistorySaleId(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoiceBody({ sale }: { sale: Sale }) {
  return (
    <div className="py-4 px-3 bg-white border border-slate-200 rounded-xl shadow-sm font-mono text-sm">
      <div className="text-center mb-5">
        <h3 className="font-bold text-lg">Ventanilla Valma</h3>
        <p className="text-xs text-muted-foreground">Consumo de empleado · Liquidación</p>
        <p className="text-xs text-muted-foreground mt-1">Factura {sale.invoiceNumber}</p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(sale.createdAt), "d MMM yyyy, h:mm a", { locale: es })}
        </p>
      </div>

      <div className="mb-4 text-sm">
        <span className="text-xs text-muted-foreground block">Empleado</span>
        <span className="font-sans font-medium">{sale.customerName}</span>
      </div>

      <div className="space-y-2 mb-4">
        {sale.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2">
            <div>
              <div>{item.productName}</div>
              <div className="text-xs text-muted-foreground">
                {item.quantity} × {formatCOP(item.unitPrice)}
              </div>
            </div>
            <div>{formatCOP(item.subtotal)}</div>
          </div>
        ))}
      </div>

      <Separator className="my-3 border-dashed" />
      <div className="flex justify-between font-bold text-base">
        <span>Total</span>
        <span>{formatCOP(sale.total)}</span>
      </div>
      <div className="mt-4 text-center text-xs text-muted-foreground">
        <Badge variant="secondary" className="mb-2">
          {metodoPago[sale.paymentMethod] ?? sale.paymentMethod}
        </Badge>
        <p>Cuenta interna cerrada · saldo pendiente $0</p>
      </div>
    </div>
  );
}
