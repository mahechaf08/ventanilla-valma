import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ArrowRightLeft,
  ReceiptText,
  UserCog,
  LogOut,
  Coffee,
  ClipboardList,
  Receipt,
  ChevronDown,
  Users,
  Warehouse,
  ChartColumn,
  BadgeDollarSign,
  Undo2,
  PackageOpen,
  Truck,
  Eraser,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { BrandMark } from '@/components/brand-mark';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const usersGroupPaths = ['/users', '/consumo', '/consumo-empleados', '/mantenimiento'];
const inventoryGroupPaths = ['/products', '/inventory', '/product-control'];
const returnsGroupPaths = ['/devoluciones/cliente', '/devoluciones/proveedor'];

/** High-contrast accent for icons on deep blue sidebar */
const iconAccent = 'text-cyan-400';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [usersOpen, setUsersOpen] = useState(() =>
    usersGroupPaths.some((p) => location === p),
  );
  const [inventoryOpen, setInventoryOpen] = useState(() =>
    inventoryGroupPaths.some((p) => location === p),
  );
  const [returnsOpen, setReturnsOpen] = useState(() =>
    returnsGroupPaths.some((p) => location === p),
  );

  const isAdmin = user?.role === 'admin';
  const displayName = user?.username?.trim() || 'Usuario';

  useEffect(() => {
    if (usersGroupPaths.some((p) => location === p)) setUsersOpen(true);
    if (inventoryGroupPaths.some((p) => location === p)) setInventoryOpen(true);
    if (returnsGroupPaths.some((p) => location === p)) setReturnsOpen(true);
  }, [location]);

  const adminTopItems: NavItem[] = [
    { href: '/', label: 'Registro de Ventas', icon: LayoutDashboard },
    { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
    { href: '/pago-facturas', label: 'Pago de Facturas', icon: Receipt },
    { href: '/sales', label: 'Historial de Ventas', icon: ReceiptText },
  ];

  const returnsSubItems: NavItem[] = [
    { href: '/devoluciones/cliente', label: 'Devolución de Producto', icon: PackageOpen },
    { href: '/devoluciones/proveedor', label: 'Devolución a Proveedores', icon: Truck },
  ];

  const inventorySubItems: NavItem[] = [
    { href: '/products', label: 'Productos', icon: Package },
    { href: '/inventory', label: 'Movimientos de Inventario', icon: ArrowRightLeft },
    { href: '/product-control', label: 'Control de Productos', icon: ChartColumn },
  ];

  const usersSubItems: NavItem[] = [
    { href: '/users', label: 'Gestión de usuarios', icon: Users },
    { href: '/consumo', label: 'Registrar consumo', icon: Coffee },
    { href: '/consumo-empleados', label: 'Historial consumo', icon: ClipboardList },
    { href: '/mantenimiento', label: 'Mantenimiento / Limpieza de Datos', icon: Eraser },
  ];

  const employeeNavItems: NavItem[] = [
    { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
    { href: '/consumo', label: 'Registrar consumo', icon: Coffee },
    { href: '/pago-facturas', label: 'Pago de Facturas', icon: Receipt },
  ];

  const usersGroupActive = usersGroupPaths.some((p) => location === p);
  const inventoryGroupActive = inventoryGroupPaths.some((p) => location === p);
  const returnsGroupActive = returnsGroupPaths.some((p) => location === p);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      toast.error('Error al cerrar sesión');
    } finally {
      setLoggingOut(false);
    }
  };

  const renderNavLink = (item: NavItem, opts?: { nested?: boolean }) => {
    const isActive = location === item.href;
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href}>
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors cursor-pointer',
            opts?.nested ? 'px-3 py-2' : 'px-3 py-2.5',
            isActive
              ? 'bg-blue-600 text-white'
              : 'text-blue-100/80 hover:bg-blue-900 hover:text-white',
          )}
        >
          <Icon className={cn('w-4 h-4 shrink-0', iconAccent)} />
          {item.label}
        </div>
      </Link>
    );
  };

  const renderCollapsible = (
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    open: boolean,
    setOpen: (v: boolean | ((p: boolean) => boolean)) => void,
    active: boolean,
    items: NavItem[],
  ) => (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          active && !open
            ? 'bg-blue-600 text-white'
            : 'text-blue-100/80 hover:bg-blue-900 hover:text-white',
        )}
        aria-expanded={open}
      >
        <Icon className={cn('w-4 h-4 shrink-0', iconAccent)} />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 shrink-0 transition-transform duration-200',
            iconAccent,
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="mt-1 ml-3 pl-3 border-l border-blue-800 space-y-0.5">
          {items.map((item) => renderNavLink(item, { nested: true }))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <aside className="w-64 flex-shrink-0 flex flex-col bg-blue-950 text-white border-r border-blue-900">
        <div className="h-16 flex items-center px-4 border-b border-blue-900 gap-3">
          <BrandMark size="md" />
          <div className="min-w-0">
            <div className="font-bold tracking-tight text-base leading-tight truncate">
              Ventanilla Valma
            </div>
            <div className="text-xs text-cyan-300/90 truncate" title={displayName}>
              {displayName}
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {isAdmin ? (
            <>
              {adminTopItems.map((item) => renderNavLink(item))}
              {renderCollapsible(
                'Devoluciones',
                Undo2,
                returnsOpen,
                setReturnsOpen,
                returnsGroupActive,
                returnsSubItems,
              )}
              {renderNavLink({
                href: '/ganancia-proveedor',
                label: 'Ganancia por Proveedor',
                icon: BadgeDollarSign,
              })}
              {renderCollapsible(
                'Inventario',
                Warehouse,
                inventoryOpen,
                setInventoryOpen,
                inventoryGroupActive,
                inventorySubItems,
              )}
              {renderCollapsible(
                'Usuarios',
                UserCog,
                usersOpen,
                setUsersOpen,
                usersGroupActive,
                usersSubItems,
              )}
            </>
          ) : (
            employeeNavItems.map((item) => renderNavLink(item))
          )}
        </nav>

        <div className="p-3 border-t border-blue-900">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-900/60">
            <div
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0',
                isAdmin ? 'bg-blue-600' : 'bg-slate-600',
              )}
            >
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-white">{user?.username}</div>
              <div className="text-xs text-blue-300/80">
                {isAdmin ? 'Administrador' : 'Empleado'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Cerrar sesión"
              className={cn(
                'p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-300 transition-colors shrink-0',
                iconAccent,
              )}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        {children}
      </main>
    </div>
  );
}
