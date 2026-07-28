import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';

import Dashboard from './pages/dashboard';
import POS from './pages/pos';
import Products from './pages/products';
import Inventory from './pages/inventory';
import Sales from './pages/sales';
import Users from './pages/users';
import NotFound from './pages/not-found';
import LoginPage from './pages/login';
import Layout from './components/layout';
import { AuthProvider, useAuth } from './contexts/auth-context';

const queryClient = new QueryClient();

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 to-emerald-900">
        <div className="text-white/60 text-sm animate-pulse">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Employees only get POS access — all other routes redirect there
  if (user.role === 'user') {
    return (
      <Layout>
        <Switch>
          <Route path="/pos" component={POS} />
          <Route>
            <Redirect to="/pos" />
          </Route>
        </Switch>
      </Layout>
    );
  }

  // Admins get full access
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pos" component={POS} />
        <Route path="/products" component={Products} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/sales" component={Sales} />
        <Route path="/users" component={Users} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
