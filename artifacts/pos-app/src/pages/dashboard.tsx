import { 
  useGetDashboardSummary, 
  useListRecentSales 
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Activity, DollarSign, Package, AlertTriangle, ArrowRight, ShoppingCart } from 'lucide-react';
import { Link } from 'wouter';
import { formatCOP } from '@/lib/currency';

const metodoPago: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  other: 'Otro',
};

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: recentSales, isLoading: isLoadingSales } = useListRecentSales({ limit: 5 });

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panel</h1>
          <p className="text-muted-foreground mt-1">Resumen del rendimiento de tu tienda.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Ingresos de Hoy"
            value={isLoadingSummary ? null : formatCOP(summary?.todayRevenue ?? 0)}
            icon={DollarSign}
            trend={isLoadingSummary ? null : `${summary?.todaySalesCount} ventas hoy`}
          />
          <MetricCard
            title="Total de Productos"
            value={isLoadingSummary ? null : summary?.totalProducts}
            icon={Package}
            trend={isLoadingSummary ? null : `En ${summary?.totalCategories} categorías`}
          />
          <MetricCard
            title="Alertas de Stock Bajo"
            value={isLoadingSummary ? null : summary?.lowStockCount}
            icon={AlertTriangle}
            trend="Artículos que necesitan reposición"
            alert={summary?.lowStockCount ? summary.lowStockCount > 0 : false}
          />
          <MetricCard
            title="Ingresos Totales"
            value={isLoadingSummary ? null : formatCOP(summary?.allTimeRevenue ?? 0)}
            icon={Activity}
            trend={isLoadingSummary ? null : `${summary?.allTimeSalesCount} ventas totales`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b mb-4">
              <CardTitle className="text-base font-semibold">Actividad de Ventas Recientes</CardTitle>
              <Link href="/sales" className="text-sm text-primary flex items-center gap-1 hover:underline">
                Ver todo <ArrowRight className="w-4 h-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {isLoadingSales ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : recentSales?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No hay ventas registradas aún.
                </div>
              ) : (
                <div className="space-y-4">
                  {recentSales?.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                      <div>
                        <div className="font-medium text-sm font-mono">{sale.invoiceNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(sale.createdAt), "d MMM, h:mm a", { locale: es })} • {sale.items.length} artículo{sale.items.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm font-mono">{formatCOP(sale.total)}</div>
                        <div className="text-xs text-muted-foreground">{metodoPago[sale.paymentMethod] ?? sale.paymentMethod}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-slate-50 dark:bg-slate-900 border-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Acciones Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/pos">
                <div className="flex items-center gap-3 p-3 rounded-md bg-white dark:bg-slate-950 border hover:border-primary transition-colors cursor-pointer group">
                  <div className="p-2 bg-primary/10 text-primary rounded">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium group-hover:text-primary transition-colors">Nueva Venta</div>
                    <div className="text-xs text-muted-foreground">Abrir el terminal de ventas</div>
                  </div>
                </div>
              </Link>
              <Link href="/products">
                <div className="flex items-center gap-3 p-3 rounded-md bg-white dark:bg-slate-950 border hover:border-primary transition-colors cursor-pointer group">
                  <div className="p-2 bg-primary/10 text-primary rounded">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium group-hover:text-primary transition-colors">Agregar Producto</div>
                    <div className="text-xs text-muted-foreground">Actualizar tu catálogo</div>
                  </div>
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, trend, alert }: { title: string, value: string | number | null, icon: any, trend: string | null, alert?: boolean }) {
  return (
    <Card className={alert ? "border-destructive/50 bg-destructive/5" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${alert ? "text-destructive" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-8 w-24 mb-1" />
        ) : (
          <div className={`text-2xl font-bold font-mono tracking-tight ${alert ? "text-destructive" : ""}`}>{value}</div>
        )}
        {trend === null ? (
          <Skeleton className="h-4 w-32 mt-2" />
        ) : (
          <p className="text-xs text-muted-foreground mt-1">{trend}</p>
        )}
      </CardContent>
    </Card>
  );
}
