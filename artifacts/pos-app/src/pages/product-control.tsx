import { useMemo, useState } from 'react';
import { useData } from '@/contexts/data-context';
import { formatCOP } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, ArrowDown, ArrowUp, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductPerformanceRow } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';

type SortKey =
  | 'name'
  | 'sku'
  | 'unitsSold'
  | 'revenue'
  | 'totalProfit'
  | 'avgMarginPercent';

type SortDir = 'asc' | 'desc';

function formatMargin(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function RankingCard({
  emoji,
  title,
  items,
  accent,
  formatMetric,
}: {
  emoji: string;
  title: string;
  items: ProductPerformanceRow[];
  accent: string;
  formatMetric: (row: ProductPerformanceRow) => string;
}) {
  return (
    <Card className="overflow-hidden flex flex-col min-h-[320px]">
      <CardHeader className={cn('pb-2 border-b border-slate-100 shrink-0', accent)}>
        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <span aria-hidden>{emoji}</span>
          {title}
        </CardTitle>
        <p className="text-[11px] text-slate-500 mt-0.5">Top {Math.min(15, items.length) || 15}</p>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        {items.length === 0 ? (
          <div className="text-sm text-slate-400 py-8 px-4 text-center">
            Sin datos de ventas aún
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <ol className="divide-y divide-slate-100">
              {items.map((row, index) => (
                <li
                  key={row.productId}
                  className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50/80"
                >
                  <span
                    className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5',
                      index < 3
                        ? 'bg-amber-500 text-slate-900'
                        : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900 leading-snug truncate">
                      {row.name}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      SKU: {row.sku}
                    </div>
                    <div className="text-xs font-mono font-semibold text-slate-800 mt-1">
                      {formatMetric(row)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProductControl() {
  const { getProductPerformance, products, sales } = useData();
  const report = useMemo(
    () => getProductPerformance(),
    // Recalculate when products/sales change (localStorage-backed state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getProductPerformance, products, sales],
  );

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('unitsSold');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'sku' ? 'asc' : 'desc');
    }
  };

  const sortedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? report.rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.sku.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q),
        )
      : report.rows;

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, 'es') * dir;
      }
      const an = av == null ? -Infinity : Number(av);
      const bn = bv == null ? -Infinity : Number(bv);
      if (an === bn) return a.name.localeCompare(b.name, 'es');
      return (an < bn ? -1 : 1) * dir;
    });
  }, [report.rows, search, sortKey, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowDownUp className="w-3.5 h-3.5 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-700" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-700" />
    );
  };

  const sortableHead = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => (
    <TableHead
      className={cn(
        'cursor-pointer select-none hover:bg-slate-50 transition-colors',
        align === 'right' && 'text-right',
      )}
      onClick={() => handleSort(key)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5',
          align === 'right' && 'justify-end w-full',
        )}
      >
        {label}
        <SortIcon column={key} />
      </span>
    </TableHead>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Control de Productos
          </h1>
          <p className="text-slate-500 mt-1">
            Rankings Top 15 y análisis de rendimiento según el historial de ventas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RankingCard
            emoji="🔥"
            title="Productos Más Vendidos"
            items={report.topMostSold}
            accent="bg-amber-50/80"
            formatMetric={(r) =>
              `${r.unitsSold} unidad${r.unitsSold !== 1 ? 'es' : ''} vendida${r.unitsSold !== 1 ? 's' : ''}`
            }
          />
          <RankingCard
            emoji="💰"
            title="Productos Más Rentables"
            items={report.topMostProfitable}
            accent="bg-blue-50/80"
            formatMetric={(r) => `${formatCOP(r.totalProfit)} ganados`}
          />
          <RankingCard
            emoji="📉"
            title="Productos Menos Vendidos"
            items={report.topLeastSold}
            accent="bg-slate-100/80"
            formatMetric={(r) =>
              `${r.unitsSold} unidad${r.unitsSold !== 1 ? 'es' : ''} vendida${r.unitsSold !== 1 ? 's' : ''}`
            }
          />
          <RankingCard
            emoji="⚠️"
            title="Productos Menos Rentables"
            items={report.topLeastProfitable}
            accent="bg-amber-50/80"
            formatMetric={(r) =>
              `${formatCOP(r.totalProfit)} · margen ${formatMargin(r.avgMarginPercent)}`
            }
          />
        </div>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <CardTitle className="text-base font-semibold">
                Tabla de rendimiento
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                {sortedRows.length} producto{sortedRows.length !== 1 ? 's' : ''} · clic en columnas
                para ordenar
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nombre o SKU…"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {report.rows.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No hay productos registrados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {sortableHead('Nombre / SKU', 'name')}
                      {sortableHead('Unidades', 'unitsSold', 'right')}
                      {sortableHead('Ingresos', 'revenue', 'right')}
                      {sortableHead('Ganancia', 'totalProfit', 'right')}
                      {sortableHead('% Margen', 'avgMarginPercent', 'right')}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                          Sin resultados para la búsqueda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedRows.map((row) => (
                        <TableRow key={row.productId}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{row.name}</div>
                            <div className="text-xs text-slate-500 font-mono">{row.sku}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {row.unitsSold}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatCOP(row.revenue)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-mono tabular-nums font-medium',
                              row.totalProfit > 0
                                ? 'text-amber-600'
                                : row.totalProfit < 0
                                  ? 'text-red-600'
                                  : 'text-slate-700',
                            )}
                          >
                            {formatCOP(row.totalProfit)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatMargin(row.avgMarginPercent)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
