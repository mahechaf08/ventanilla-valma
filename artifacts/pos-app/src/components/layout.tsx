import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  ArrowRightLeft, 
  ReceiptText,
  UserCog,
  LogOut,
  ChevronDown,
  Flame
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useState } from 'react';
import { toast } from 'sonner';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const isAdmin = user?.role === 'admin';

  const adminNavItems = [
    { href: '/', label: 'Panel', icon: LayoutDashboard },
    { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
    { href: '/products', label: 'Catálogo', icon: Package },
    { href: '/inventory', label: 'Inventario', icon: ArrowRightLeft },
    { href: '/sales', label: 'Ventas', icon: ReceiptText },
    { href: '/users', label: 'Usuarios', icon: UserCog },
  ];

  const employeeNavItems = [
    { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
  ];

  const navItems = isAdmin ? adminNavItems : employeeNavItems;

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

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside className="w-64 border-r bg-sidebar flex-shrink-0 flex flex-col">
        {/* Brand header */}
        <div className="h-14 flex items-center px-4 border-b gap-2">
          <div className="w-8 h-8 bg-emerald-600 text-white rounded flex items-center justify-center">
            <Flame className="w-4 h-4" />
          </div>
          <span className="font-bold tracking-tight text-lg">Fuego Verde</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all cursor-pointer",
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-sidebar-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
                )}>
                  {isActive && (
                    <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-white/40" />
                  )}
                  <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-white" : "text-muted-foreground")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-2 p-2 rounded-md bg-slate-100 dark:bg-slate-800">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
              isAdmin ? "bg-emerald-600" : "bg-slate-500"
            )}>
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.username}</div>
              <div className="text-xs text-muted-foreground">
                {isAdmin ? 'Administrador' : 'Empleado'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Cerrar sesión"
              className="p-1.5 rounded hover:bg-red-100 hover:text-red-600 text-muted-foreground transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
