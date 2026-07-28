import { useState, useMemo } from 'react';
import { 
  useListProducts, 
  useListCategories,
  useCreateSale,
  getListProductsQueryKey,
  getListSalesQueryKey,
  getListRecentSalesQueryKey,
  getGetDashboardSummaryQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, User, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Product, SaleInputPaymentMethod } from '@workspace/api-client-react/src/generated/api.schemas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatCOP } from '@/lib/currency';

interface CartItem {
  product: Product;
  quantity: number;
}

const metodoPago: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  other: 'Otro',
};

export default function POS() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  
  const { data: products, isLoading: isLoadingProducts } = useListProducts({ search, category: activeCategory || undefined });
  const { data: categories } = useListCategories();
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SaleInputPaymentMethod>('card');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<any>(null);

  const createSale = useCreateSale();

  const addToCart = (product: Product) => {
    if (product.stockQuantity <= 0) {
      toast.error('Sin stock disponible');
      return;
    }
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) {
          toast.error('No se puede agregar más del stock disponible');
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQ = item.quantity + delta;
        if (newQ > item.product.stockQuantity) {
          toast.error('No puede superar el stock disponible');
          return item;
        }
        return { ...item, quantity: Math.max(0, newQ) };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0), [cart]);
  const total = subtotal;

  const handleCheckout = () => {
    if (cart.length === 0) return;
    
    createSale.mutate({
      data: {
        customerName: customerName.trim() || undefined,
        paymentMethod,
        taxRate: 0,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity
        }))
      }
    }, {
      onSuccess: (sale) => {
        setReceiptSale(sale);
        setCart([]);
        setCustomerName('');
        setCheckoutOpen(false);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListRecentSalesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast.success('Venta completada exitosamente');
      },
      onError: () => {
        toast.error('Error al completar la venta');
      }
    });
  };

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden">
      {/* Área de Catálogo de Productos */}
      <div className="flex-1 flex flex-col h-full border-r overflow-hidden">
        <div className="p-4 bg-white border-b flex-shrink-0 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar productos por nombre o SKU..." 
              className="pl-9 h-10 w-full"
            />
          </div>
          <ScrollArea className="w-1/2 whitespace-nowrap h-10 border rounded-md">
            <div className="flex w-max space-x-2 p-1">
              <Badge 
                variant={activeCategory === null ? 'default' : 'secondary'}
                className="cursor-pointer hover:bg-primary/90 h-7"
                onClick={() => setActiveCategory(null)}
              >
                Todos
              </Badge>
              {categories?.map(cat => (
                <Badge 
                  key={cat} 
                  variant={activeCategory === cat ? 'default' : 'secondary'}
                  className="cursor-pointer hover:bg-primary/90 h-7 capitalize"
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </Badge>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          {isLoadingProducts ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-200 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : products?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p>No se encontraron productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {products?.map(product => (
                <div 
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`relative p-4 rounded-xl border bg-white cursor-pointer transition-all hover:border-primary hover:shadow-md ${product.stockQuantity <= 0 ? 'opacity-50 grayscale' : ''}`}
                >
                  <div className="font-medium line-clamp-2 leading-tight mb-2 h-10">{product.name}</div>
                  <div className="flex items-end justify-between mt-auto">
                    <div className="font-mono text-lg font-bold">{formatCOP(product.price)}</div>
                  </div>
                  <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">{product.category}</Badge>
                    <Badge variant={product.stockQuantity > 0 ? "secondary" : "destructive"} className="text-[10px]">
                      {product.stockQuantity} en stock
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Área del Carrito */}
      <div className="w-96 bg-white flex-shrink-0 flex flex-col h-full">
        <div className="p-4 border-b bg-slate-100 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" /> Venta Actual
          </h2>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCart([])} className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10">
              Vaciar
            </Button>
          )}
        </div>
        
        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground mt-32">
              <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">El carrito está vacío</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div key={item.product.id} className="flex flex-col gap-2 p-3 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="font-medium text-sm leading-tight pr-4">{item.product.name}</div>
                    <div className="font-mono font-semibold text-sm">
                      {formatCOP(item.product.price * item.quantity)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-xs text-muted-foreground font-mono">{formatCOP(item.product.price)} / u.</div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-md p-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateQuantity(item.product.id, -1)}>
                        {item.quantity === 1 ? <Trash2 className="w-3 h-3 text-destructive" /> : <Minus className="w-3 h-3" />}
                      </Button>
                      <span className="w-8 text-center font-mono text-sm">{item.quantity}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateQuantity(item.product.id, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 bg-slate-50 border-t">
          <div className="space-y-2 mb-4">
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="font-mono text-primary">{formatCOP(total)}</span>
            </div>
          </div>
          <Button 
            className="w-full h-12 text-base" 
            size="lg" 
            disabled={cart.length === 0}
            onClick={() => setCheckoutOpen(true)}
          >
            Cobrar {formatCOP(total)}
          </Button>
        </div>
      </div>

      {/* Diálogo de Pago */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Completar Pago</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-lg">
              <span className="text-sm text-muted-foreground mb-1">Monto Total</span>
              <span className="text-4xl font-bold font-mono tracking-tighter">{formatCOP(total)}</span>
            </div>

            <div className="space-y-3">
              <Label>Método de Pago</Label>
              <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as SaleInputPaymentMethod)} className="grid grid-cols-3 gap-2">
                <Label
                  className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${paymentMethod === 'card' ? 'border-primary bg-primary/5' : ''}`}
                >
                  <RadioGroupItem value="card" className="sr-only" />
                  <CreditCard className="mb-2 h-6 w-6" />
                  Tarjeta
                </Label>
                <Label
                  className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${paymentMethod === 'cash' ? 'border-primary bg-primary/5' : ''}`}
                >
                  <RadioGroupItem value="cash" className="sr-only" />
                  <Banknote className="mb-2 h-6 w-6" />
                  Efectivo
                </Label>
                <Label
                  className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${paymentMethod === 'other' ? 'border-primary bg-primary/5' : ''}`}
                >
                  <RadioGroupItem value="other" className="sr-only" />
                  <User className="mb-2 h-6 w-6" />
                  Otro
                </Label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer">Nombre del Cliente (Opcional)</Label>
              <Input 
                id="customer" 
                placeholder="Cliente en tienda" 
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancelar</Button>
            <Button onClick={handleCheckout} disabled={createSale.isPending}>
              {createSale.isPending ? 'Procesando...' : 'Confirmar Pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Recibo */}
      <Dialog open={!!receiptSale} onOpenChange={(open) => !open && setReceiptSale(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-center">Venta Completada</DialogTitle>
          </DialogHeader>
          {receiptSale && (
            <div className="py-6 px-4 bg-white border border-dashed border-slate-300 mx-auto w-full max-w-[320px] font-mono text-sm">
              <div className="text-center mb-6">
                <h3 className="font-bold text-lg mb-1">VM-COFFEE</h3>
                <p className="text-muted-foreground text-xs">Recibo {receiptSale.invoiceNumber}</p>
                <p className="text-muted-foreground text-xs">{new Date(receiptSale.createdAt).toLocaleString('es-CO')}</p>
              </div>
              
              <div className="space-y-2 mb-4">
                {receiptSale.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-start">
                    <div className="pr-4">
                      <div>{item.productName}</div>
                      <div className="text-xs text-muted-foreground">{item.quantity} x {formatCOP(item.unitPrice)}</div>
                    </div>
                    <div>{formatCOP(item.subtotal)}</div>
                  </div>
                ))}
              </div>
              
              <Separator className="border-dashed my-4" />
              
              <div className="space-y-1">
                <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-dashed">
                  <span>Total</span>
                  <span>{formatCOP(receiptSale.total)}</span>
                </div>
              </div>
              
              <div className="mt-6 text-center text-xs text-muted-foreground">
                <p>Pagado con {metodoPago[receiptSale.paymentMethod] ?? receiptSale.paymentMethod}</p>
                {receiptSale.customerName && <p>Cliente: {receiptSale.customerName}</p>}
                <p className="mt-4">¡Gracias por su compra!</p>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setReceiptSale(null)} className="w-full">Nueva Venta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
