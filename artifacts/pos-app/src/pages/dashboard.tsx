import { useMemo, useState } from 'react';
import { useData } from '@/contexts/data-context';
import { toDateKey } from '@/lib/date';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity,
  DollarSign,
  Package,
  AlertTriangle,
  ArrowRight,
  ShoppingCart,
  Users,
  Calculator,
  ClipboardList,
  Banknote,
  CreditCard,
} from 'lucide-react';
import { Link } from 'wouter';
import { formatCOP } from '@/lib/currency';
import { formatPaymentSummary } from '@/lib/payments';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

function todayInputValue() {
  return toDateKey(new Date());
}

export default function Dashboard() {
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Registro de Ventas</h1>
          <p className="text-slate-500 mt-1">
            Control diario de ventas por empleado y cierre de caja.
          </p>
        </div>

        <Tabs defaultValue="resumen" className="space-y-6">
          <TabsList>
            <TabsTrigger value="resumen" className="gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="empleado" className="gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Ventas del Empleado
            </TabsTrigger>
            <TabsTrigger value="cierre" className="gap-1.5">
              <Calculator className="w-3.5 h-3.5" />
              Cierre de Caja
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="mt-0">
            <ResumenTab />
          </TabsContent>
          <TabsContent value="empleado" className="mt-0">
            <VentasEmpleadoTab />
          </TabsContent>
          <TabsContent value="cierre" className="mt-0">
            <CierreCajaTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ResumenTab() {
  const { getDashboardSummary, listRecentSales } = useData();
  const summary = getDashboardSummary();
  const recentSales = listRecentSales(5);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Ingresos de Hoy"
          value={formatCOP(summary.todayRevenue)}
          icon={DollarSign}
          trend={`${summary.todaySalesCount} ventas hoy`}
        />
        <MetricCard
          title="Total de Productos"
          value={summary.totalProducts}
          icon={Package}
          trend={`En ${summary.totalCategories} categorías`}
        />
        <MetricCard
          title="Alertas de Cantidad Baja"
          value={summary.lowStockCount}
          icon={AlertTriangle}
          trend="Artículos con poco inventario"
          alert={summary.lowStockCount > 0}
        />
        <MetricCard
          title="Ingresos Totales"
          value={formatCOP(summary.allTimeRevenue)}
          icon={Activity}
          trend={`${summary.allTimeSalesCount} ventas totales`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-100 mb-4">
            <CardTitle className="text-base font-semibold">Actividad de Ventas Recientes</CardTitle>
            <Link href="/sales" className="text-sm text-blue-700 flex items-center gap-1 hover:underline">
              Ver todo <ArrowRight className="w-4 h-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No hay ventas registradas aún.
              </div>
            ) : (
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between border-b border-slate-100 pb-4 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="font-medium text-sm font-mono text-slate-900">
                        {sale.invoiceNumber}
                      </div>
                      <div className="text-xs text-slate-500">
                        {format(new Date(sale.createdAt), 'd MMM, h:mm a', { locale: es })} •{' '}
                        {sale.items.length} artículo{sale.items.length !== 1 ? 's' : ''}
                        {sale.cashier ? ` · ${sale.cashier}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm font-mono text-slate-900">
                        {formatCOP(sale.total)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatPaymentSummary(sale)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Acciones Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/pos">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-400 transition-colors cursor-pointer">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-900">Nueva Venta</div>
                  <div className="text-xs text-slate-500">Abrir el terminal de ventas</div>
                </div>
              </div>
            </Link>
            <Link href="/products">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-400 transition-colors cursor-pointer">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-900">Agregar Producto</div>
                  <div className="text-xs text-slate-500">Actualizar el inventario</div>
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VentasEmpleadoTab() {
  const { getEmployeeDaySales, listSalesByDate } = useData();
  const { listUsers } = useAuth();
  const [dateKey, setDateKey] = useState(todayInputValue);
  const [employee, setEmployee] = useState<string>('all');

  const users = listUsers();
  const daySales = listSalesByDate(dateKey).filter((s) => s.source !== 'employee_consumption');
  const cashierOptions = useMemo(() => {
    const fromSales = new Set(
      daySales.map((s) => s.cashier?.trim() || 'Sin asignar').filter(Boolean),
    );
    for (const u of users) fromSales.add(u.username);
    return [...fromSales].sort((a, b) => a.localeCompare(b, 'es'));
  }, [daySales, users]);

  const summaries = getEmployeeDaySales(dateKey, employee === 'all' ? null : employee);
  const totals = summaries.reduce(
    (acc, s) => ({
      amount: acc.amount + s.totalAmount,
      txs: acc.txs + s.transactionCount,
      products: acc.products + s.productsSold,
    }),
    { amount: 0, txs: 0, products: 0 },
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-date">Fecha</Label>
              <Input
                id="emp-date"
                type="date"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value || todayInputValue())}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Trabajador</Label>
              <Select value={employee} onValueChange={setEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empleado..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los trabajadores</SelectItem>
                  {cashierOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Total vendido" value={formatCOP(totals.amount)} icon={DollarSign} trend="Del filtro actual" />
        <MetricCard title="Transacciones" value={totals.txs} icon={ClipboardList} trend="Ventas completadas" />
        <MetricCard title="Productos vendidos" value={totals.products} icon={Package} trend="Unidades totales" />
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400 text-sm">
            No hay ventas POS para esta fecha{employee !== 'all' ? ' y trabajador' : ''}.
          </CardContent>
        </Card>
      ) : (
        summaries.map((summary) => (
          <Card key={summary.cashier}>
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{summary.cashier}</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">
                    {summary.transactionCount} transacción
                    {summary.transactionCount !== 1 ? 'es' : ''} · {summary.productsSold} producto
                    {summary.productsSold !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Total vendido</div>
                  <div className="text-2xl font-mono font-bold text-blue-700">
                    {formatCOP(summary.totalAmount)}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <ScrollArea className="max-h-[420px]">
                <div className="space-y-4 pr-2">
                  {summary.sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-mono font-semibold text-slate-900">
                            {sale.invoiceNumber}
                          </div>
                          <div className="text-xs text-slate-500">
                            {format(new Date(sale.createdAt), "d MMM yyyy · h:mm a", { locale: es })}
                            {sale.customerName ? ` · ${sale.customerName}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {formatPaymentSummary(sale)}
                          </Badge>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCOP(sale.total)}
                          </span>
                        </div>
                      </div>
                      <Separator />
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                            <TableHead className="text-right">Precio</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sale.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.productName}</TableCell>
                              <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                              <TableCell className="text-right font-mono text-slate-500">
                                {formatCOP(item.unitPrice)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCOP(item.subtotal)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function CierreCajaTab() {
  const { user } = useAuth();
  const {
    getCashClosePreview,
    getCashCloseForDate,
    saveCashClose,
  } = useData();

  const [dateKey, setDateKey] = useState(todayInputValue);
  const existing = getCashCloseForDate(dateKey);
  const [openingFloat, setOpeningFloat] = useState(
    existing ? String(existing.openingFloat) : '0',
  );
  const [countedCash, setCountedCash] = useState(
    existing ? String(existing.countedCash) : '',
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Sync form when date or existing close changes
  const openingNum = Math.max(0, Math.round(Number(openingFloat) || 0));
  const countedNum = Math.max(0, Math.round(Number(countedCash) || 0));
  const preview = getCashClosePreview(dateKey, openingNum);
  const difference = countedCash === '' ? null : countedNum - preview.expectedCash;
  const statusLabel =
    difference == null
      ? null
      : difference === 0
        ? 'Cuadrada'
        : difference < 0
          ? 'Faltante'
          : 'Sobrante';

  const handleDateChange = (value: string) => {
    const next = value || todayInputValue();
    setDateKey(next);
    const found = getCashCloseForDate(next);
    setOpeningFloat(found ? String(found.openingFloat) : '0');
    setCountedCash(found ? String(found.countedCash) : '');
    setNotes(found?.notes ?? '');
  };

  const handleSave = () => {
    if (!user) return;
    if (countedCash === '' || Number.isNaN(Number(countedCash))) {
      toast.error('Ingresa el efectivo real contado');
      return;
    }
    setSaving(true);
    try {
      const saved = saveCashClose({
        dateKey,
        openingFloat: openingNum,
        countedCash: countedNum,
        closedBy: user.username,
        closedByUserId: user.id,
        notes: notes || undefined,
      });
      toast.success(
        saved.status === 'cuadrada'
          ? 'Cierre de caja guardado: caja cuadrada'
          : `Cierre guardado: ${saved.status === 'faltante' ? 'faltante' : 'sobrante'} de ${formatCOP(Math.abs(saved.difference))}`,
      );
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar el cierre');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            Cierre de Caja
          </CardTitle>
          <p className="text-sm text-slate-500">
            Cuadra el turno o el día con el efectivo físico contado.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="close-date">Fecha del cierre</Label>
              <Input
                id="close-date"
                type="date"
                value={dateKey}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opening">Fondo inicial (Base de caja)</Label>
              <Input
                id="opening"
                type="number"
                min="0"
                step="100"
                className="font-mono"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                placeholder="ej: 100000"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                <Banknote className="w-4 h-4 text-blue-600" />
                Ventas en efectivo
              </div>
              <div className="text-xl font-mono font-bold text-slate-900">
                {formatCOP(preview.cashSales)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                <CreditCard className="w-4 h-4 text-slate-500" />
                Otros medios
              </div>
              <div className="text-xl font-mono font-bold text-slate-900">
                {formatCOP(preview.otherSales)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Tarjeta, transferencias y otros</p>
            </div>
            {preview.cashOuts > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:col-span-2">
                <div className="text-sm text-amber-800 mb-1">Salidas de caja del día</div>
                <div className="text-xl font-mono font-bold text-amber-900">
                  −{formatCOP(preview.cashOuts)}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:col-span-2">
              <div className="text-sm text-blue-800 mb-1">Total esperado en caja física</div>
              <div className="text-2xl font-mono font-bold text-blue-900">
                {formatCOP(preview.expectedCash)}
              </div>
              <p className="text-[11px] text-blue-700/80 mt-1">
                Fondo inicial + ventas en efectivo
                {preview.cashOuts > 0 ? ' − salidas de caja' : ''}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="counted">Efectivo real contado</Label>
            <Input
              id="counted"
              type="number"
              min="0"
              step="100"
              className="font-mono text-lg h-12"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              placeholder="Ingresa el conteo físico"
            />
          </div>

          {statusLabel && difference != null && (
            <div
              className={`rounded-xl border px-4 py-4 ${
                statusLabel === 'Cuadrada'
                  ? 'border-blue-300 bg-blue-50 text-blue-900'
                  : statusLabel === 'Faltante'
                    ? 'border-red-300 bg-red-50 text-red-900'
                    : 'border-amber-300 bg-amber-50 text-amber-950'
              }`}
            >
              <div className="text-xs uppercase tracking-wide opacity-80">Resultado</div>
              <div className="text-2xl font-bold mt-0.5">{statusLabel}</div>
              {difference !== 0 && (
                <div className="font-mono text-lg mt-1">
                  {difference > 0 ? '+' : '−'}
                  {formatCOP(Math.abs(difference))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="close-notes">Notas (opcional)</Label>
            <Input
              id="close-notes"
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones del turno..."
            />
          </div>

          {existing && (
            <p className="text-xs text-slate-500">
              Ya existe un cierre para esta fecha (por {existing.closedBy} el{' '}
              {format(new Date(existing.createdAt), "d MMM yyyy, h:mm a", { locale: es })}). Guardar
              lo actualizará.
            </p>
          )}

          <Button
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Guardando...' : existing ? 'Actualizar Cierre de Caja' : 'Registrar Cierre de Caja'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  alert,
}: {
  title: string;
  value: string | number;
  icon: any;
  trend: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? 'border-red-200 bg-red-50' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${alert ? 'text-red-600' : 'text-slate-400'}`} />
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold font-mono tracking-tight ${alert ? 'text-red-700' : 'text-slate-900'}`}
        >
          {value}
        </div>
        <p className="text-xs text-slate-500 mt-1">{trend}</p>
      </CardContent>
    </Card>
  );
}
