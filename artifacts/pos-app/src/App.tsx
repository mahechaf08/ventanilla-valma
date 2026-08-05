import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';

import Dashboard from './pages/dashboard';
import POS from './pages/pos';
import Products from './pages/products';
import Inventory from './pages/inventory';
import ProductControl from './pages/product-control';
import SupplierProfitabilityPage from './pages/supplier-profitability';
import SupplierReturns from './pages/supplier-returns';
import CustomerReturnsPage from './pages/customer-returns';
import Sales from './pages/sales';
import Users from './pages/users';
import RegisterConsumption from './pages/register-consumption';
import EmployeeConsumptionAdmin from './pages/employee-consumption';
import SupplierInvoicesPage from './pages/supplier-invoices';
import NotFound from './pages/not-found';
import LoginPage from './pages/login';
import Layout from './components/layout';
import { AuthProvider, useAuth } from './contexts/auth-context';
import { DataProvider } from './contexts/data-context';

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 to-blue-900">
        <div className="text-white/60 text-sm animate-pulse">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (user.role === 'user') {
    return (
      <Layout>
        <Switch>
          <Route path="/pos" component={POS} />
          <Route path="/consumo" component={RegisterConsumption} />
          <Route path="/pago-facturas" component={SupplierInvoicesPage} />
          <Route>
            <Redirect to="/pos" />
          </Route>
        </Switch>
      </Layout>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pos" component={POS} />
        <Route path="/products" component={Products} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/product-control" component={ProductControl} />
        <Route path="/ganancia-proveedor" component={SupplierProfitabilityPage} />
        <Route path="/purchase-orders">
          <Redirect to="/products" />
        </Route>
        <Route path="/devoluciones/cliente" component={CustomerReturnsPage} />
        <Route path="/devoluciones/proveedor" component={SupplierReturns} />
        <Route path="/customer-returns">
          <Redirect to="/devoluciones/cliente" />
        </Route>
        <Route path="/supplier-returns">
          <Redirect to="/devoluciones/proveedor" />
        </Route>
        <Route path="/sales" component={Sales} />
        <Route path="/consumo" component={RegisterConsumption} />
        <Route path="/consumo-empleados" component={EmployeeConsumptionAdmin} />
        <Route path="/pago-facturas" component={SupplierInvoicesPage} />
        <Route path="/users" component={Users} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AuthProvider>
          <DataProvider>
            <Router />
          </DataProvider>
        </AuthProvider>
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
