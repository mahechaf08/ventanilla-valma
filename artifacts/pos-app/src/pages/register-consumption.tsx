import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useData } from '@/contexts/data-context';
import { formatCOP } from '@/lib/currency';
import type { Product } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Coffee,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

interface CartItem {
  product: Product;
  quantity: number;
}

export default function RegisterConsumption() {
  const { user, listUsers } = useAuth();
  const { listProducts, registerConsumption } = useData();
  const employees = listUsers();
  const isAdmin = user?.role === 'admin';

  const [employeeId, setEmployeeId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Employees always consume under their own logged-in session.
  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      setEmployeeId(String(user.id));
      return;
    }
    if (!employeeId) {
      setEmployeeId(String(user.id));
    }
  }, [user, isAdmin, employeeId]);

  const products = listProducts({ search });

  const selectedEmployee = useMemo(() => {
    if (!user) return null;
    if (!isAdmin) {
      return {
        id: user.id,
        username: user.username,
        role: user.role,
      };
    }
    return employees.find((e) => String(e.id) === employeeId) ?? null;
  }, [user, isAdmin, employees, employeeId]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart],
  );

  const addToCart = (product: Product) => {
    if (product.stockQuantity <= 0) {
      toast.error('Sin cantidad disponible');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) {
          toast.error('No se puede agregar más de la cantidad disponible');
          return prev;
        }
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty > item.product.stockQuantity) {
            toast.error('No puede superar la cantidad disponible');
            return item;
          }
          return { ...item, quantity: Math.max(0, nextQty) };
        })
        .filter((item) => item.quantity > 0),
    );
  };

  const handleSubmit = () => {
    if (!selectedEmployee) {
      toast.error('No hay sesión de empleado activa');
      return;
    }
    if (!cart.length) {
      toast.error('Agrega productos al consumo');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      registerConsumption({
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.username,
        registeredBy: user.username,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
      });
      toast.success(`Consumo registrado para ${selectedEmployee.username}`);
      setCart([]);
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar el consumo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 flex flex-col h-full border-r border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0 flex flex-col items-stretch !py-4 space-y-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Coffee className="w-5 h-5 text-amber-600" />
              Registrar consumo interno
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Descuenta inventario de inmediato. No cuenta como venta hasta que el admin liquide la cuenta.
            </p>
          </div>
          <div className={isAdmin ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
            {isAdmin ? (
              <div className="space-y-1.5">
                <Label>Cuenta del empleado</Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar empleado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.username}
                        {e.role === 'admin' ? ' (admin)' : ' (cajero)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2 text-sm">
                <UserRound className="w-4 h-4 text-amber-800" />
                <span>
                  Registrando a nombre de{' '}
                  <strong className="text-amber-950">{user?.username}</strong>
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Buscar producto</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre o SKU..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Search className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((product) => {
                const out = product.stockQuantity <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={out}
                    onClick={() => addToCart(product)}
                    className="bg-white border border-slate-200 rounded-xl shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition text-left p-3 disabled:opacity-45 disabled:pointer-events-none disabled:hover:translate-y-0"
                  >
                    <div className="text-xs text-muted-foreground mb-1">{product.category}</div>
                    <div className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">{product.name}</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-blue-700 text-sm">
                        {formatCOP(product.price)}
                      </span>
                      <span className={out ? 'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-800' : 'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-500 text-slate-900'}>
                        {out ? 'Sin cantidad' : `${product.stockQuantity} uds`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="w-96 flex-shrink-0 flex flex-col h-full bg-white border-l border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-amber-50 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2 text-amber-900">
            <ShoppingBag className="w-4 h-4" /> Consumo
          </h2>
          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCart([])}
              className="h-8 text-destructive hover:text-destructive"
            >
              Vaciar
            </Button>
          )}
        </div>

        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 text-sm">
            <UserRound className="w-4 h-4 text-muted-foreground" />
            {selectedEmployee ? (
              <span className="font-medium">{selectedEmployee.username}</span>
            ) : (
              <span className="text-muted-foreground italic">Sin empleado</span>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="mt-24 text-center text-muted-foreground text-sm">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-20" />
              Selecciona productos para el consumo interno
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.product.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div className="text-sm font-medium leading-tight">{item.product.name}</div>
                    <div className="font-mono text-sm font-semibold">
                      {formatCOP(item.product.price * item.quantity)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatCOP(item.product.price)} / u.
                    </span>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => updateQuantity(item.product.id, -1)}
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-3 h-3 text-destructive" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                      </Button>
                      <span className="w-7 text-center font-mono text-sm">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => updateQuantity(item.product.id, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
          <Separator />
          <div className="rounded-xl px-4 py-3 text-center bg-amber-600 text-white">
            <div className="text-xs uppercase tracking-widest text-white/90 mb-1">Total interno</div>
            <div className="text-2xl font-mono font-bold">{formatCOP(total)}</div>
          </div>
          <p className="text-xs text-muted-foreground">
            Se acumula en el saldo del empleado hasta que el admin liquide la cuenta (en cualquier momento).
          </p>
          <Button
            className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-bold"
            disabled={!selectedEmployee || cart.length === 0 || saving}
            onClick={handleSubmit}
          >
            {saving ? 'Registrando...' : 'Registrar consumo'}
          </Button>
        </div>
      </div>
    </div>
  );
}
