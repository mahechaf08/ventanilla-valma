import { useState } from 'react';
import { useListSales } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Eye, CreditCard, Banknote, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const metodoPago: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  other: 'Otro',
};

const estadoVenta: Record<string, string> = {
  completed: 'COMPLETADA',
  voided: 'ANULADA',
};

export default function Sales() {
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const { data: sales, isLoading } = useListSales({ limit, offset });
  
  const [selectedSale, setSelectedSale] = useState<any>(null);

  const getPaymentIcon = (method: string) => {
    switch(method) {
      case 'card': return <CreditCard className="w-3 h-3" />;
      case 'cash': return <Banknote className="w-3 h-3" />;
      default: return <User className="w-3 h-3" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-6 border-b flex items-center justify-between bg-slate-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Historial de Ventas</h1>
          <p className="text-sm text-muted-foreground mt-1">Ver facturas y recibos anteriores.</p>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="border rounded-md flex-1 overflow-auto shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Factura #</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Artículos</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando historial de ventas...</TableCell>
                </TableRow>
              ) : sales?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No hay ventas registradas aún.
                  </TableCell>
                </TableRow>
              ) : (
                sales?.map((sale) => (
                  <TableRow key={sale.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedSale(sale)}>
                    <TableCell className="font-mono font-medium">{sale.invoiceNumber}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(sale.createdAt), "d MMM yyyy, h:mm a", { locale: es })}
                    </TableCell>
                    <TableCell>{sale.customerName || <span className="text-muted-foreground italic">Cliente en tienda</span>}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] gap-1 px-2 py-0 h-5">
                        {getPaymentIcon(sale.paymentMethod)} {metodoPago[sale.paymentMethod] ?? sale.paymentMethod}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-mono">{sale.items.length}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">${sale.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <div>Mostrando {sales?.length || 0} ventas</div>
          <div className="space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setOffset(o => Math.max(0, o - limit))}
              disabled={offset === 0}
            >
              Anterior
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setOffset(o => o + limit)}
              disabled={!sales || sales.length < limit}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* Diálogo de Detalle de Factura */}
      <Dialog open={!!selectedSale} onOpenChange={(open) => !open && setSelectedSale(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Detalle de Factura</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="py-6 px-4 bg-slate-50 border rounded-md font-mono text-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-bold text-lg">SISTEMA POS</h3>
                  <p className="text-muted-foreground">Recibo {selectedSale.invoiceNumber}</p>
                </div>
                <div className="text-right text-muted-foreground text-xs">
                  {format(new Date(selectedSale.createdAt), 'dd/MM/yyyy')}<br />
                  {format(new Date(selectedSale.createdAt), 'h:mm a')}
                </div>
              </div>
              
              {selectedSale.customerName && (
                <div className="mb-6 text-sm">
                  <span className="text-muted-foreground block text-xs">Cliente:</span>
                  <span className="font-sans font-medium">{selectedSale.customerName}</span>
                </div>
              )}
              
              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-12 text-xs font-bold text-muted-foreground pb-2 border-b">
                  <div className="col-span-6">ARTÍCULO</div>
                  <div className="col-span-3 text-right">CANT×PRECIO</div>
                  <div className="col-span-3 text-right">TOTAL</div>
                </div>
                {selectedSale.items.map((item: any) => (
                  <div key={item.id} className="grid grid-cols-12 items-start py-1">
                    <div className="col-span-6 font-sans text-sm">{item.productName}</div>
                    <div className="col-span-3 text-right text-xs text-muted-foreground mt-0.5">{item.quantity} × ${item.unitPrice.toFixed(2)}</div>
                    <div className="col-span-3 text-right">${item.subtotal.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>${selectedSale.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Impuesto</span>
                  <span>${selectedSale.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-slate-300">
                  <span>Total</span>
                  <span className="text-primary">${selectedSale.total.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="mt-8 text-center text-xs text-muted-foreground bg-white p-3 rounded border">
                Estado: <span className="uppercase font-bold text-foreground">{estadoVenta[selectedSale.status] ?? selectedSale.status}</span>
                <br />
                Pagado con {metodoPago[selectedSale.paymentMethod] ?? selectedSale.paymentMethod}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
