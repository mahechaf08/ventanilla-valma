import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, Printer, Search } from 'lucide-react';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import { ReceiptTicket } from '@/components/receipt-ticket';
import { SyncSalesButton } from '@/components/sync-sales-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatCOP } from '@/lib/currency';
import { isDateKeyInRange, toDateKey } from '@/lib/date';
import { formatPaymentSummary } from '@/lib/payments';
import type { Sale } from '@/types';

function todayKey() {
  return toDateKey(new Date());
}

export default function SalesInvoicesPage() {
  const { sales } = useData();
  const { listUsers } = useAuth();

  const [fromKey, setFromKey] = useState(() => todayKey());
  const [toKey, setToKey] = useState(() => todayKey());
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [cashier, setCashier] = useState<string>('all');
  const [printSale, setPrintSale] = useState<Sale | null>(null);

  const cashierOptions = useMemo(() => {
    const names = new Set<string>();
    for (const s of sales) {
      if (s.source === 'employee_consumption') continue;
      names.add(s.cashier?.trim() || 'Sin asignar');
    }
    for (const u of listUsers()) names.add(u.username);
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [sales, listUsers]);

  const invoices = useMemo(() => {
    const q = invoiceQuery.trim().toLowerCase();
    return sales
      .filter((s) => s.source !== 'employee_consumption')
      .filter((s) => isDateKeyInRange(s.createdAt, fromKey, toKey))
      .filter((s) => {
        if (!q) return true;
        return (
          s.invoiceNumber.toLowerCase().includes(q) ||
          (s.customerName || '').toLowerCase().includes(q)
        );
      })
      .filter((s) => {
        if (cashier === 'all') return true;
        return (s.cashier?.trim() || 'Sin asignar') === cashier;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.id - a.id,
      );
  }, [sales, fromKey, toKey, invoiceQuery, cashier]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            Factura de Ventas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consulta e imprime facturas / tiques de ventas a clientes.
          </p>
        </div>
        <SyncSalesButton className="flex-shrink-0" />
      </div>

      <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl">
          <div className="space-y-1.5">
            <Label htmlFor="inv-from">Desde</Label>
            <Input
              id="inv-from"
              type="date"
              value={fromKey}
              onChange={(e) => setFromKey(e.target.value || todayKey())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-to">Hasta</Label>
            <Input
              id="inv-to"
              type="date"
              value={toKey}
              onChange={(e) => setToKey(e.target.value || todayKey())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-search">N° Factura / Cliente</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                id="inv-search"
                value={invoiceQuery}
                onChange={(e) => setInvoiceQuery(e.target.value)}
                placeholder="Buscar…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Cajero</Label>
            <Select value={cashier} onValueChange={setCashier}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los cajeros</SelectItem>
                {cashierOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          {invoices.length} factura{invoices.length === 1 ? '' : 's'} encontrada
          {invoices.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead>N° Factura</TableHead>
                <TableHead>Fecha / Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Método de Pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right w-[160px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No hay facturas para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono font-medium">{sale.invoiceNumber}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(sale.createdAt), "d MMM yyyy, h:mm a", { locale: es })}
                    </TableCell>
                    <TableCell>{sale.customerName?.trim() || '—'}</TableCell>
                    <TableCell>{sale.cashier?.trim() || 'Sin asignar'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {formatPaymentSummary(sale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCOP(sale.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setPrintSale(sale)}
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Imprimir Factura
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!printSale} onOpenChange={(open) => !open && setPrintSale(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-center">Vista previa de factura</DialogTitle>
          </DialogHeader>
          {printSale && (
            <div className="py-4 px-3 bg-white border border-dashed border-slate-300 mx-auto w-full max-w-[320px]">
              <ReceiptTicket sale={printSale} />
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-col gap-2 sm:space-x-0">
            <Button
              type="button"
              onClick={() => window.print()}
              className="w-full h-11 gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold"
            >
              <Printer className="w-4 h-4" />
              Imprimir Factura / Tique
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setPrintSale(null)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printSale && (
        <div id="pos-thermal-receipt" className="hidden" aria-hidden>
          <ReceiptTicket sale={printSale} />
        </div>
      )}
    </div>
  );
}
