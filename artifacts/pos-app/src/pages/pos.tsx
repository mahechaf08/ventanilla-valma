import { useState, useMemo, useRef, useCallback } from 'react';
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
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, User, ShoppingCart, Coffee, Wrench, Package, Droplets, Filter, Scale, Zap, Thermometer, Star, ChevronLeft, ChevronRight } from 'lucide-react';
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

function getCategoryStyle(category: string): { icon: React.ReactNode; bg: string; iconColor: string } {
  const c = category.toLowerCase();
  if (c.includes('bebida') || c.includes('bever') || c.includes('café') || c.includes('coffee') || c.includes('brew') || c.includes('milk') || c.includes('leche') || c.includes('syrup') || c.includes('jarabe') || c.includes('oat'))
    return { icon: <Coffee className="w-6 h-6" />, bg: 'bg-amber-50', iconColor: 'text-amber-500' };
  if (c.includes('equip') || c.includes('machine') || c.includes('kettle') || c.includes('grinder') || c.includes('scale') || c.includes('báscula'))
    return { icon: <Wrench className="w-6 h-6" />, bg: 'bg-blue-50', iconColor: 'text-blue-500' };
  if (c.includes('filter') || c.includes('filtro'))
    return { icon: <Filter className="w-6 h-6" />, bg: 'bg-slate-50', iconColor: 'text-slate-500' };
  if (c.includes('accesorio') || c.includes('accessor') || c.includes('cup') || c.includes('mug') || c.includes('taza') || c.includes('thermos') || c.includes('termo') || c.includes('travel'))
    return { icon: <Thermometer className="w-6 h-6" />, bg: 'bg-purple-50', iconColor: 'text-purple-500' };
  if (c.includes('electr') || c.includes('digital'))
    return { icon: <Zap className="w-6 h-6" />, bg: 'bg-yellow-50', iconColor: 'text-yellow-500' };
  if (c.includes('drop') || c.includes('pour') || c.includes('dripper'))
    return { icon: <Droplets className="w-6 h-6" />, bg: 'bg-teal-50', iconColor: 'text-teal-500' };
  return { icon: <Star className="w-6 h-6" />, bg: 'bg-emerald-50', iconColor: 'text-emerald-500' };
}

export default function POS() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const scrollCategories = useCallback((dir: 'left' | 'right') => {
    const el = categoryScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  }, []);
  
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
          {/* Category scroll bar with arrow buttons */}
          <div className="flex items-center gap-1 w-1/2 min-w-0">
            <button
              onClick={() => scrollCategories('left')}
              className="shrink-0 w-7 h-8 flex items-center justify-center rounded border bg-white hover:bg-slate-100 text-muted-foreground transition-colors"
              aria-label="Scroll izquierda"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div
              ref={categoryScrollRef}
              className="flex-1 overflow-x-auto flex items-center gap-1.5 py-0.5 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <Badge
                variant={activeCategory === null ? 'default' : 'secondary'}
                className="cursor-pointer hover:bg-primary/90 h-7 shrink-0"
                onClick={() => setActiveCategory(null)}
              >
                Todos
              </Badge>
              {categories?.map(cat => (
                <Badge
                  key={cat}
                  variant={activeCategory === cat ? 'default' : 'secondary'}
                  className="cursor-pointer hover:bg-primary/90 h-7 capitalize shrink-0"
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </Badge>
              ))}
            </div>
            <button
              onClick={() => scrollCategories('right')}
              className="shrink-0 w-7 h-8 flex items-center justify-center rounded border bg-white hover:bg-slate-100 text-muted-foreground transition-colors"
              aria-label="Scroll derecha"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
              {products?.map(product => {
                const { icon, bg, iconColor } = getCategoryStyle(product.category);
                const outOfStock = product.stockQuantity <= 0;
                return (
                  <div
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={`flex flex-col rounded-2xl border bg-white shadow-sm cursor-pointer transition-all duration-150 hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 overflow-hidden ${outOfStock ? 'opacity-50 grayscale pointer-events-none' : ''}`}
                  >
                    {/* Icon zone */}
                    <div className={`${bg} flex items-center justify-center py-5 relative`}>
                      <div className={`${iconColor}`}>{icon}</div>
                      <span className={`absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/70 backdrop-blur-sm ${iconColor} border border-current/10`}>
                        {product.category}
                      </span>
                    </div>

                    {/* Content zone */}
                    <div className="flex flex-col flex-1 p-3 gap-1.5">
                      <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">
                        {product.name}
                      </p>

                      <p className={`text-xs ${outOfStock ? 'text-destructive font-medium' : 'text-slate-400'} flex items-center gap-1`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${outOfStock ? 'bg-destructive' : 'bg-emerald-400'}`} />
                        {outOfStock ? 'Sin stock' : `${product.stockQuantity} en stock`}
                      </p>

                      <p className="mt-auto pt-1.5 border-t border-slate-100 font-mono font-bold text-emerald-700 text-base tracking-tight">
                        {formatCOP(product.price)}
                      </p>
                    </div>
                  </div>
                );
              })}
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
                <h3 className="font-bold text-lg mb-1">Fuego Verde</h3>
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
