import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserPlus, Trash2, UserCog, ShieldCheck, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/contexts/auth-context';

interface AppUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
}

const apiBase = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'user' as 'admin' | 'user' });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/users`, { credentials: 'include' });
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const openCreate = () => {
    setForm({ username: '', password: '', role: 'user' });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.username || !form.password) {
      toast.error('Completa todos los campos');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al crear usuario');
        return;
      }
      toast.success('Usuario registrado exitosamente');
      setCreateOpen(false);
      fetchUsers();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al eliminar usuario');
        return;
      }
      toast.success('Usuario eliminado');
      setDeleteTarget(null);
      fetchUsers();
    } finally {
      setDeleting(false);
    }
  };

  const admins = users.filter(u => u.role === 'admin');
  const employees = users.filter(u => u.role === 'user');

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-6 border-b bg-slate-50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <UserCog className="w-6 h-6 text-primary" />
              Gestión de Usuarios
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Administra los accesos al sistema Fuego Verde.
            </p>
          </div>

          {/* Primary CTA */}
          <Button
            onClick={openCreate}
            size="lg"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
          >
            <UserPlus className="w-5 h-5" />
            Registrar nuevo usuario
          </Button>
        </div>

        {/* Stats strip */}
        <div className="mt-4 flex gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{admins.length} administrador{admins.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span>{employees.length} empleado{employees.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="p-6 flex-1 overflow-hidden flex flex-col gap-4">
        <div className="border rounded-lg flex-1 overflow-auto shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Fecha de registro</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    Cargando usuarios...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Users className="w-10 h-10 opacity-30" />
                      <p className="text-sm">No hay usuarios registrados.</p>
                      <Button variant="outline" size="sm" onClick={openCreate} className="gap-1">
                        <UserPlus className="w-4 h-4" /> Registrar primer usuario
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map(u => (
                  <TableRow key={u.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${u.role === 'admin' ? 'bg-emerald-600' : 'bg-slate-400'}`}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">{u.username}</div>
                          {currentUser?.id === u.id && (
                            <div className="text-xs text-emerald-600 font-medium">sesión activa</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.role === 'admin' ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1 font-medium">
                          <ShieldCheck className="w-3 h-3" /> Administrador
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <User className="w-3 h-3" /> Empleado (cajero)
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(u.createdAt), "d 'de' MMMM yyyy, h:mm a", { locale: es })}
                    </TableCell>
                    <TableCell>
                      {currentUser?.id !== u.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Inline quick-register card */}
        <div
          className="border-2 border-dashed border-emerald-200 rounded-lg p-4 flex items-center justify-between bg-emerald-50/50 cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
          onClick={openCreate}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-800">Registrar nuevo usuario</p>
              <p className="text-xs text-emerald-600">Añade un cajero o administrador al sistema</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-100">
            <UserPlus className="w-4 h-4" /> Registrar
          </Button>
        </div>
      </div>

      {/* Register User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              Registrar nuevo usuario
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-username">Nombre de usuario *</Label>
              <Input
                id="new-username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="ej: maria.garcia"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Contraseña *</Label>
              <Input
                id="new-password"
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de acceso *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: 'user' }))}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-sm font-medium ${form.role === 'user' ? 'border-primary bg-primary/5 text-primary' : 'border-muted text-muted-foreground hover:border-primary/40'}`}
                >
                  <User className="w-5 h-5" />
                  Empleado (cajero)
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: 'admin' }))}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-sm font-medium ${form.role === 'admin' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-muted text-muted-foreground hover:border-emerald-400'}`}
                >
                  <ShieldCheck className="w-5 h-5" />
                  Administrador
                </button>
              </div>
              <p className="text-xs text-muted-foreground bg-slate-50 rounded p-2">
                {form.role === 'admin'
                  ? '⚙️ Acceso completo: ventas, inventario, productos y usuarios.'
                  : '🛒 Solo acceso al Punto de Venta para procesar ventas.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {saving ? 'Registrando...' : 'Registrar usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la cuenta de <strong>{deleteTarget?.username}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
