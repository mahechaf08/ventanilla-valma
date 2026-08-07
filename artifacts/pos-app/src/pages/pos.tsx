import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Coffee,
  Wrench,
  Droplets,
  Filter,
  Zap,
  Thermometer,
  Star,
  ChevronLeft,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PaymentMethod, Product, Sale } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCOP } from '@/lib/currency';
import { PAYMENT_METHODS } from '@/lib/payments';
import { isEditableTarget, playScanBeep } from '@/lib/scan-beep';
import { cn } from '@/lib/utils';
import { ReceiptTicket, salePaymentsForReceipt } from '@/components/receipt-ticket';

const BEEP_STORAGE_KEY = 'vv_pos_scan_beep';

interface CartItem {
  product: Product;
  quantity: number;
  /** Unit price for this line (admin may override catalog price). */
  unitPrice: number;
}

type PaymentRow = {
  key: string;
  method: PaymentMethod;
  amount: string;
};

function newPaymentRow(method: PaymentMethod = 'cash', amount = ''): PaymentRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    method,
    amount,
  };
}

function lineUnitPrice(item: CartItem): number {
  return item.unitPrice ?? item.product.price;
}

function getCategoryStyle(category: string): { icon: React.ReactNode; bg: string; iconColor: string } {
  const c = category.toLowerCase();
  if (c.includes('bebida') || c.includes('bever') || c.includes('café') || c.includes('cafe') || c.includes('coffee') || c.includes('brew') || c.includes('milk') || c.includes('leche') || c.includes('syrup') || c.includes('jarabe') || c.includes('oat'))
    return { icon: <Coffee className="w-6 h-6" />, bg: 'bg-amber-50', iconColor: 'text-amber-600' };
  if (c.includes('equip') || c.includes('machine') || c.includes('kettle') || c.includes('grinder') || c.includes('scale') || c.includes('báscula'))
    return { icon: <Wrench className="w-6 h-6" />, bg: 'bg-teal-50', iconColor: 'text-teal-600' };
  if (c.includes('filter') || c.includes('filtro'))
    return { icon: <Filter className="w-6 h-6" />, bg: 'bg-stone-50', iconColor: 'text-stone-600' };
  if (c.includes('accesorio') || c.includes('accessor') || c.includes('cup') || c.includes('mug') || c.includes('taza') || c.includes('thermos') || c.includes('termo') || c.includes('travel'))
    return { icon: <Thermometer className="w-6 h-6" />, bg: 'bg-amber-50', iconColor: 'text-amber-600' };
  if (c.includes('electr') || c.includes('digital'))
    return { icon: <Zap className="w-6 h-6" />, bg: 'bg-yellow-50', iconColor: 'text-yellow-600' };
  if (c.includes('drop') || c.includes('pour') || c.includes('dripper'))
    return { icon: <Droplets className="w-6 h-6" />, bg: 'bg-cyan-50', iconColor: 'text-cyan-600' };
  return { icon: <Star className="w-6 h-6" />, bg: 'bg-blue-50', iconColor: 'text-blue-600' };
}

export default function POS() {
  const { products: catalog, listProducts, listCategories, createSale } = useData();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef({ value: '', lastAt: 0 });
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [beepEnabled, setBeepEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(BEEP_STORAGE_KEY);
      return raw == null ? true : raw === '1';
    } catch {
      return true;
    }
  });
  const [lastScannedId, setLastScannedId] = useState<number | null>(null);
  const [scanFlash, setScanFlash] = useState(false);

  const scrollCategories = useCallback((dir: 'left' | 'right') => {
    const el = categoryScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  }, []);

  const products = listProducts({
    search,
    category: activeCategory || undefined,
  });
  const categories = listCategories();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([newPaymentRow('cash')]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  const modalBlocking = checkoutOpen || !!receiptSale;

  const focusSearch = useCallback(() => {
    if (modalBlocking) return;
    const el = searchInputRef.current;
    if (!el) return;
    const active = document.activeElement;
    if (active && active !== el && isEditableTarget(active)) return;
    el.focus({ preventScroll: true });
  }, [modalBlocking]);

  const findByCode = useCallback(
    (raw: string): Product | undefined => {
      const code = raw.trim();
      if (!code) return undefined;
      const upper = code.toUpperCase();
      return catalog.find(
        (p) =>
          (p.barcode && p.barcode.trim().toUpperCase() === upper) ||
          p.sku.trim().toUpperCase() === upper ||
          (p.reference && p.reference.trim().toUpperCase() === upper),
      );
    },
    [catalog],
  );

  const addToCart = useCallback((product: Product): boolean => {
    if (product.stockQuantity <= 0) {
      toast.error('Sin cantidad disponible');
      return false;
    }

    const existing = cart.find((item) => item.product.id === product.id);
    if (existing && existing.quantity >= product.stockQuantity) {
      toast.error('No se puede agregar más de la cantidad disponible');
      return false;
    }

    setCart((prev) => {
      const cur = prev.find((item) => item.product.id === product.id);
      if (cur) {
        if (cur.quantity >= product.stockQuantity) return prev;
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { product, quantity: 1, unitPrice: product.price }];
    });
    return true;
  }, [cart]);

  const handleBarcodeScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      const product = findByCode(code);
      setSearch('');
      queueMicrotask(() => focusSearch());

      if (!product) {
        toast.error('Producto no encontrado', {
          description: `Código: ${code}`,
        });
        return;
      }

      const added = addToCart(product);
      if (!added) return;

      playScanBeep(beepEnabled);
      setLastScannedId(product.id);
      setScanFlash(true);
      window.setTimeout(() => setScanFlash(false), 450);
      toast.success(`${product.name} agregado`, { duration: 1400 });
    },
    [addToCart, beepEnabled, findByCode, focusSearch],
  );

  useEffect(() => {
    if (modalBlocking) return;
    const t = window.setTimeout(() => focusSearch(), 50);
    return () => window.clearTimeout(t);
  }, [modalBlocking, focusSearch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modalBlocking) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const active = document.activeElement;
      const onSearch = active === searchInputRef.current;

      if (onSearch) return;
      if (isEditableTarget(active)) return;

      const now = Date.now();
      const buf = scanBufferRef.current;

      if (e.key === 'Enter') {
        if (buf.value.length >= 2) {
          e.preventDefault();
          const code = buf.value;
          buf.value = '';
          buf.lastAt = 0;
          handleBarcodeScan(code);
        } else {
          buf.value = '';
        }
        return;
      }

      if (e.key.length !== 1) return;

      if (now - buf.lastAt > 80) {
        buf.value = '';
      }
      buf.value += e.key;
      buf.lastAt = now;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBarcodeScan, modalBlocking]);

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQ = item.quantity + delta;
        if (newQ > item.product.stockQuantity) {
          toast.error('No puede superar la cantidad disponible');
          return item;
        }
        return { ...item, quantity: Math.max(0, newQ) };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const updateUnitPrice = (productId: number, raw: string) => {
    if (!isAdmin) return;
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, unitPrice: parsed } : item,
      ),
    );
  };

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + lineUnitPrice(item) * item.quantity, 0),
    [cart],
  );
  const total = subtotal;

  const totalEntered = useMemo(
    () =>
      paymentRows.reduce((sum, row) => sum + (Math.round(Number(row.amount)) || 0), 0),
    [paymentRows],
  );
  const remaining = total - totalEntered;
  const change = totalEntered > total ? totalEntered - total : 0;
  const canFinalize = cart.length > 0 && totalEntered >= total && total > 0;

  useEffect(() => {
    if (!checkoutOpen) return;
    setPaymentRows([newPaymentRow('cash', String(total))]);
  }, [checkoutOpen, total]);

  const openCheckout = () => {
    if (cart.length === 0) return;
    setCheckoutOpen(true);
  };

  const handleCheckout = () => {
    if (cart.length === 0 || !canFinalize) return;
    setCheckoutPending(true);
    try {
      const payments = paymentRows
        .map((row) => ({
          method: row.method,
          amount: Math.round(Number(row.amount)) || 0,
        }))
        .filter((p) => p.amount > 0);

      const sale = createSale({
        customerName: customerName.trim() || undefined,
        payments,
        cashier: user?.username,
        cashierUserId: user?.id ?? null,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: lineUnitPrice(item),
        })),
      });
      setReceiptSale(sale);
      setCart([]);
      setCustomerName('');
      setCheckoutOpen(false);
      toast.success('Venta completada exitosamente');
    } catch (err: any) {
      toast.error(err?.message || 'Error al completar la venta');
    } finally {
      setCheckoutPending(false);
    }
  };

  const updatePaymentRow = (key: string, patch: Partial<PaymentRow>) => {
    setPaymentRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const receiptPayments = receiptSale ? salePaymentsForReceipt(receiptSale) : [];

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50">
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-200">
        <div className="p-4 bg-white border-b border-slate-200 flex-shrink-0 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                handleBarcodeScan(search);
              }}
              onBlur={() => {
                window.setTimeout(() => focusSearch(), 120);
              }}
              placeholder="Escanear código o buscar por nombre / SKU…"
              className="pl-9 h-10 w-full"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="search"
              aria-label="Búsqueda y escáner de códigos de barras"
            />
          </div>
          <button
            type="button"
            title={beepEnabled ? 'Desactivar beep de escaneo' : 'Activar beep de escaneo'}
            onClick={() => {
              setBeepEnabled((v) => {
                const next = !v;
                try {
                  localStorage.setItem(BEEP_STORAGE_KEY, next ? '1' : '0');
                } catch {
                  /* ignore */
                }
                return next;
              });
            }}
            className={cn(
              'shrink-0 h-10 px-3 rounded-lg border text-xs font-semibold transition-colors',
              beepEnabled
                ? 'border-amber-400 bg-amber-500 text-slate-900'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
            )}
          >
            Beep {beepEnabled ? 'ON' : 'OFF'}
          </button>
          <div className="flex items-center gap-1 w-1/2 min-w-0">
            <button
              onClick={() => scrollCategories('left')}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
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
                className="cursor-pointer h-7 shrink-0"
                onClick={() => setActiveCategory(null)}
              >
                Todos
              </Badge>
              {categories.map(cat => (
                <Badge
                  key={cat}
                  variant={activeCategory === cat ? 'default' : 'secondary'}
                  className="cursor-pointer h-7 capitalize shrink-0"
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </Badge>
              ))}
            </div>
            <button
              onClick={() => scrollCategories('right')}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              aria-label="Scroll derecha"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Search className="w-12 h-12 mb-4 opacity-40" />
              <p>No se encontraron productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(product => {
                const { icon, bg, iconColor } = getCategoryStyle(product.category);
                const outOfStock = product.stockQuantity <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={outOfStock}
                    className={`text-left bg-white border border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden transition hover:border-blue-400 hover:shadow-md disabled:opacity-45 disabled:pointer-events-none`}
                  >
                    <div className={`${bg} flex items-center justify-center py-5 relative border-b border-slate-100`}>
                      <div className={iconColor}>{icon}</div>
                      <span className={`absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-white border border-slate-200 ${iconColor}`}>
                        {product.category}
                      </span>
                    </div>
                    <div className="flex flex-col p-3 gap-1.5">
                      <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 min-h-[2.5rem]">
                        {product.name}
                      </p>
                      <div>
                        {outOfStock ? (
                          <Badge variant="destructive" className="text-[10px]">Sin cantidad</Badge>
                        ) : product.stockQuantity <= 5 ? (
                          <Badge className="text-[10px] bg-amber-100 text-amber-800 border-0 hover:bg-amber-100">
                            {product.stockQuantity} uds
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-amber-500 text-slate-900 border-0 hover:bg-amber-500">
                            {product.stockQuantity} uds
                          </Badge>
                        )}
                      </div>
                      <p className="mt-auto pt-1.5 border-t border-slate-100 font-mono font-bold text-blue-700 text-base">
                        {formatCOP(product.price)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="w-96 flex-shrink-0 flex flex-col h-full bg-white border-l border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2 text-slate-900">
            <ShoppingCart className="w-4 h-4 text-blue-600" /> Venta Actual
          </h2>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCart([])} className="h-8 text-red-600 hover:text-red-700">
              Vaciar
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 mt-32">
              <ShoppingCart className="w-12 h-12 mb-4 opacity-40" />
              <p className="text-sm">El carrito está vacío</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => {
                const unit = lineUnitPrice(item);
                const lineTotal = unit * item.quantity;
                const priceOverridden = unit !== item.product.price;
                return (
                  <div
                    key={item.product.id}
                    className={cn(
                      'bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-col gap-2 transition-colors',
                      lastScannedId === item.product.id && scanFlash && 'border-amber-400 bg-amber-50 ring-2 ring-amber-300',
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-medium text-sm text-slate-900 leading-tight pr-4">
                        {item.product.name}
                      </div>
                      <div className="font-mono font-semibold text-sm text-slate-900">
                        {formatCOP(lineTotal)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isAdmin ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">$</span>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={unit}
                              onChange={(e) => updateUnitPrice(item.product.id, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              className="h-7 w-[5.5rem] font-mono text-xs px-1.5"
                              aria-label={`Precio unitario de ${item.product.name}`}
                              title="Editar precio unitario (solo admin)"
                            />
                            <span className="text-xs text-slate-500 shrink-0">/ u.</span>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 font-mono">
                            {formatCOP(unit)} / u.
                          </div>
                        )}
                        {isAdmin && priceOverridden && (
                          <Badge
                            variant="outline"
                            className="text-[9px] h-5 px-1.5 border-amber-300 text-amber-800 bg-amber-50"
                          >
                            editado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 p-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.product.id, -1)}>
                          {item.quantity === 1 ? <Trash2 className="w-3 h-3 text-red-600" /> : <Minus className="w-3 h-3" />}
                        </Button>
                        <span className="w-8 text-center font-mono text-sm">{item.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.product.id, 1)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {isAdmin && priceOverridden && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        Lista: {formatCOP(item.product.price)} / u.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
          <div className="flex justify-between items-end">
            <span className="text-sm font-medium text-slate-600 tracking-wide">
              Valor a pagar
            </span>
            <span className="text-3xl font-bold font-mono text-slate-900 tracking-tight">
              {formatCOP(total)}
            </span>
          </div>
          <Button
            className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 text-white font-bold"
            size="lg"
            disabled={cart.length === 0}
            onClick={openCheckout}
          >
            Valor a pagar {formatCOP(total)}
          </Button>
        </div>
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Completar pago</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[60vh] pr-2">
            <div className="grid gap-5 py-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-[11px] text-slate-500 mb-0.5">Valor a pagar</div>
                  <div className="font-mono font-bold text-slate-900 text-sm">{formatCOP(total)}</div>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                  <div className="text-[11px] text-blue-700 mb-0.5">Total ingresado</div>
                  <div className="font-mono font-bold text-blue-950 text-sm">{formatCOP(totalEntered)}</div>
                </div>
                <div
                  className={cn(
                    'rounded-xl border p-3 text-center',
                    remaining > 0
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-cyan-200 bg-cyan-50',
                  )}
                >
                  <div className="text-[11px] text-slate-600 mb-0.5">
                    {remaining > 0 ? 'Pendiente' : 'Cambio'}
                  </div>
                  <div
                    className={cn(
                      'font-mono font-bold text-sm',
                      remaining > 0 ? 'text-amber-900' : 'text-cyan-900',
                    )}
                  >
                    {formatCOP(remaining > 0 ? remaining : change)}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-900">Pagos mixtos</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      setPaymentRows((prev) => [
                        ...prev,
                        newPaymentRow(
                          'card',
                          remaining > 0 ? String(remaining) : '',
                        ),
                      ])
                    }
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar método
                  </Button>
                </div>

                <div className="space-y-2">
                  {paymentRows.map((row) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-12 gap-2 items-end rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div className="col-span-6 space-y-1">
                        <span className="text-[11px] text-slate-500">Método</span>
                        <Select
                          value={row.method}
                          onValueChange={(v) =>
                            updatePaymentRow(row.key, { method: v as PaymentMethod })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-5 space-y-1">
                        <span className="text-[11px] text-slate-500">Monto</span>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={row.amount}
                          onChange={(e) =>
                            updatePaymentRow(row.key, { amount: e.target.value })
                          }
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end pb-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          disabled={paymentRows.length <= 1}
                          onClick={() =>
                            setPaymentRows((prev) => prev.filter((r) => r.key !== row.key))
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
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
          </ScrollArea>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCheckout}
              disabled={checkoutPending || !canFinalize}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {checkoutPending ? 'Procesando...' : 'Finalizar venta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiptSale} onOpenChange={(open) => !open && setReceiptSale(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-center">Venta Completada</DialogTitle>
          </DialogHeader>
          {receiptSale && (
            <div className="py-4 px-3 bg-white border border-dashed border-slate-300 mx-auto w-full max-w-[320px]">
              <ReceiptTicket sale={receiptSale} payments={receiptPayments} />
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-col gap-2 sm:space-x-0">
            <Button
              type="button"
              onClick={handlePrintReceipt}
              className="w-full h-11 gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold"
            >
              <Printer className="w-4 h-4" />
              Imprimir Factura / Tique
            </Button>
            <Button
              onClick={() => setReceiptSale(null)}
              variant="outline"
              className="w-full font-semibold"
            >
              Nueva Venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print-only thermal ticket (80mm) */}
      {receiptSale && (
        <div id="pos-thermal-receipt" className="hidden" aria-hidden>
          <ReceiptTicket sale={receiptSale} payments={receiptPayments} />
        </div>
      )}
    </div>
  );
}
