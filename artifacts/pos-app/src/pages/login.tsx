import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Flame, Lock, User } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-green-950 via-emerald-900 to-green-800">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_80%,rgba(255,255,255,0.15)_0%,transparent_50%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.1)_0%,transparent_50%)]" />

      <div className="relative w-full max-w-sm mx-4">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-green-700 to-emerald-600 px-8 py-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm mb-4 ring-4 ring-white/30">
              <Flame className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Fuego Verde</h1>
            <p className="text-emerald-100 text-sm mt-1">Sistema de Punto de Venta</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
            <div className="text-center mb-2">
              <h2 className="text-lg font-semibold text-slate-800">Iniciar Sesión</h2>
              <p className="text-sm text-slate-500 mt-0.5">Ingresa tus credenciales para continuar</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700 font-medium">Usuario</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="Nombre de usuario"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="pl-10 h-11 border-slate-200 focus:border-emerald-500 focus:ring-emerald-500"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 h-11 border-slate-200 focus:border-emerald-500 focus:ring-emerald-500"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <span className="shrink-0">⚠</span>
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base rounded-lg transition-colors"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </form>
        </div>

        <p className="text-center text-emerald-200/60 text-xs mt-6">
          © {new Date().getFullYear()} Fuego Verde — Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
