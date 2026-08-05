import { useMemo, useState } from 'react';
import { useData } from '@/contexts/data-context';
import {
  addDaysToDateKey,
  previousPeriodRange,
  startOfMonthDateKey,
  toDateKey,
} from '@/lib/date';
import { formatCOP } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import {
  BadgeDollarSign,
  ChartColumn,
  Package,
  Percent,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Minus,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SupplierProfitabilityReport } from '@/types';

function todayKey() {
  return toDateKey(new Date());
}

type QuickRange = 'today' | 'last7' | 'last15' | 'last30' | 'month' | 'custom';

function resolveQuickRange(preset: Exclude<QuickRange, 'custom'>): { from: string; to: string } {
  const today = todayKey();
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDaysToDateKey(today, -6), to: today };
    case 'last15':
      return { from: addDaysToDateKey(today, -14), to: today };
    case 'last30':
      return { from: addDaysToDateKey(today, -29), to: today };
    case 'month':
      return { from: startOfMonthDateKey(), to: today };
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function formatSignedCOP(n: number) {
  const abs = formatCOP(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function formatSignedPct(n: number | null) {
  if (n == null) return 'n/a';
  if (n > 0) return `+${n}%`;
  if (n < 0) return `${n}%`;
  return '0%';
}

export default function SupplierProfitabilityPage() {
  const { listSupplierNames, getSupplierProfitability } = useData();
  const suppliers = listSupplierNames();

  const [supplier, setSupplier] = useState<string>('all');
  const [fromKey, setFromKey] = useState(() => resolveQuickRange('last30').from);
  const [toKey, setToKey] = useState(() => resolveQuickRange('last30').to);
  const [preset, setPreset] = useState<QuickRange>('last30');
  const [compare, setCompare] = useState(false);

  const applyPreset = (next: Exclude<QuickRange, 'custom'>) => {
    const range = resolveQuickRange(next);
    setPreset(next);
    setFromKey(range.from);
    setToKey(range.to);
  };

  const primary = useMemo(
    () => getSupplierProfitability(supplier, fromKey, toKey),
    [getSupplierProfitability, supplier, fromKey, toKey],
  );

  const compareRange = useMemo(
    () => previousPeriodRange(primary.fromKey, primary.toKey),
    [primary.fromKey, primary.toKey],
  );

  const secondary = useMemo(
    () =>
      compare
        ? getSupplierProfitability(supplier, compareRange.fromKey, compareRange.toKey)
        : null,
    [compare, compareRange.fromKey, compareRange.toKey, getSupplierProfitability, supplier],
  );

  const presets: { id: Exclude<QuickRange, 'custom'>; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'last7', label: 'Últimos 7 días' },
    { id: 'last15', label: 'Últimos 15 días' },
    { id: 'last30', label: 'Últimos 30 días' },
    { id: 'month', label: 'Este mes' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700">
            <ChartColumn className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Ganancia por Proveedor
            </h1>
            <p className="text-slate-500 mt-1">
              Inversión, ventas, costo de lo vendido y rentabilidad por proveedor en el período
              seleccionado.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={preset === p.id ? 'default' : 'outline'}
                  className={cn(
                    preset === p.id
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'border-slate-200 text-slate-700',
                  )}
                  onClick={() => applyPreset(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5 lg:col-span-2">
                <Label>Proveedor</Label>
                <Select value={supplier} onValueChange={setSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los proveedores</SelectItem>
                    {suppliers.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-from">Fecha inicio</Label>
                <Input
                  id="sp-from"
                  type="date"
                  value={fromKey}
                  max={toKey}
                  onChange={(e) => {
                    setPreset('custom');
                    setFromKey(e.target.value || todayKey());
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-to">Fecha fin</Label>
                <Input
                  id="sp-to"
                  type="date"
                  value={toKey}
                  min={fromKey}
                  onChange={(e) => {
                    setPreset('custom');
                    setToKey(e.target.value || todayKey());
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Comparar períodos</div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {compare
                    ? `vs ${compareRange.fromKey} → ${compareRange.toKey}`
                    : 'Activa para contrastar contra el período anterior de igual duración'}
                </p>
              </div>
              <Switch
                checked={compare}
                onCheckedChange={setCompare}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            title="Inversión total"
            value={formatCOP(primary.capitalInvested)}
            icon={Wallet}
            compare={delta(primary, secondary, 'capitalInvested')}
          />
          <KpiCard
            title="Ingresos por ventas"
            value={formatCOP(primary.grossRevenue)}
            icon={BadgeDollarSign}
            compare={delta(primary, secondary, 'grossRevenue')}
          />
          <KpiCard
            title="Costo de lo vendido"
            value={formatCOP(primary.cogs)}
            icon={ShoppingBag}
            compare={delta(primary, secondary, 'cogs')}
          />
          <KpiCard
            title="Ganancia neta"
            value={formatCOP(primary.netProfit)}
            icon={TrendingUp}
            accent="amber"
            compare={delta(primary, secondary, 'netProfit')}
          />
          <KpiCard
            title="ROI / Margen"
            value={
              primary.roiPercent != null
                ? `${primary.roiPercent}%`
                : primary.marginPercent != null
                  ? `${primary.marginPercent}%`
                  : '—'
            }
            icon={Percent}
            trend={
              primary.capitalInvested > 0
                ? 'ROI sobre inversión'
                : primary.marginPercent != null
                  ? 'Margen sobre ventas'
                  : 'Sin base de cálculo'
            }
            compare={
              secondary
                ? {
                    delta: (primary.roiPercent ?? 0) - (secondary.roiPercent ?? 0),
                    pct: pctChange(primary.roiPercent ?? 0, secondary.roiPercent ?? 0),
                    previous: secondary.roiPercent ?? 0,
                    money: false,
                    suffix: '%',
                  }
                : null
            }
          />
        </div>

        {secondary && (
          <Card className="border-blue-100 bg-blue-50/40">
            <CardContent className="py-4 text-sm text-slate-600">
              Comparando{' '}
              <span className="font-medium text-slate-800">
                {primary.fromKey} → {primary.toKey}
              </span>{' '}
              contra{' '}
              <span className="font-medium text-slate-800">
                {secondary.fromKey} → {secondary.toKey}
              </span>
              {supplier !== 'all' ? (
                <>
                  {' '}
                  para <span className="font-medium text-slate-800">{supplier}</span>
                </>
              ) : (
                ' (todos los proveedores)'
              )}
              . La inversión usa cargas de inventario; el COGS usa costo de compra del proveedor o
              costo promedio del producto.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5 text-slate-500" />
              Desglose por producto
            </CardTitle>
            <p className="text-sm text-slate-500">
              Unidades compradas vs vendidas, costo, ingresos y utilidad neta en el rango.
            </p>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {primary.products.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No hay compras ni ventas atribuibles a este proveedor en el período.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    {supplier === 'all' && <TableHead>Proveedor</TableHead>}
                    <TableHead className="text-right">Comprados</TableHead>
                    <TableHead className="text-right">Vendidos</TableHead>
                    <TableHead className="text-right">Costo compra</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Ganancia neta</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {primary.products.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{row.productName}</div>
                        <div className="text-xs text-slate-500 font-mono">{row.sku}</div>
                      </TableCell>
                      {supplier === 'all' && (
                        <TableCell className="text-sm text-slate-600">{row.supplierName}</TableCell>
                      )}
                      <TableCell className="text-right font-mono">{row.unitsPurchased}</TableCell>
                      <TableCell className="text-right font-mono">{row.unitsSold}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCOP(row.purchaseCostTotal)}
                        {row.avgPurchaseUnitCost != null && row.unitsPurchased > 0 && (
                          <div className="text-[10px] text-slate-400">
                            ~{formatCOP(row.avgPurchaseUnitCost)} c/u
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-blue-700">
                        {formatCOP(row.grossRevenue)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono font-semibold',
                          row.netProfit >= 0 ? 'text-amber-800' : 'text-red-700',
                        )}
                      >
                        {formatCOP(row.netProfit)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.currentStock}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function delta(
  primary: SupplierProfitabilityReport,
  secondary: SupplierProfitabilityReport | null,
  key: 'capitalInvested' | 'grossRevenue' | 'cogs' | 'netProfit',
) {
  if (!secondary) return null;
  return {
    delta: primary[key] - secondary[key],
    pct: pctChange(primary[key], secondary[key]),
    previous: secondary[key],
    money: true as const,
  };
}

function KpiCard({
  title,
  value,
  icon: Icon,
  accent,
  trend,
  compare,
}: {
  title: string;
  value: string;
  icon: any;
  accent?: 'amber';
  trend?: string;
  compare: {
    delta: number;
    pct: number | null;
    previous: number;
    money?: boolean;
    suffix?: string;
  } | null;
}) {
  const money = compare?.money !== false;
  const up = (compare?.delta ?? 0) > 0;
  const down = (compare?.delta ?? 0) < 0;
  const TrendIcon = up ? TrendingUp : down ? TrendingDown : Minus;

  return (
    <Card className={accent === 'amber' ? 'border-amber-100' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${accent === 'amber' ? 'text-amber-500' : 'text-slate-400'}`} />
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold font-mono tracking-tight ${
            accent === 'amber' ? 'text-amber-800' : 'text-slate-900'
          }`}
        >
          {value}
        </div>
        {compare ? (
          <div className="mt-2 space-y-1">
            <div
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                up && 'text-emerald-700',
                down && 'text-red-600',
                !up && !down && 'text-slate-500',
              )}
            >
              <TrendIcon className="w-3.5 h-3.5" />
              <span>{formatSignedPct(compare.pct)}</span>
              <span className="text-slate-400">·</span>
              <span>
                {money
                  ? formatSignedCOP(compare.delta)
                  : `${compare.delta > 0 ? '+' : ''}${compare.delta}${compare.suffix ?? ''}`}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Período ant.:{' '}
              {money
                ? formatCOP(compare.previous)
                : `${compare.previous}${compare.suffix ?? ''}`}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500 mt-1">{trend ?? 'Rango seleccionado'}</p>
        )}
      </CardContent>
    </Card>
  );
}
