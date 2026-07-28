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
import { Plus, Trash2, UserCog, ShieldCheck, User } from 'lucide-react';
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

export default function Users() {
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
      toast.success('Usuario creado exitosamente');
      setCreateOpen(false);
      setForm({ username: '', password: '', role: 'user' });
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

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-6 border-b flex items-center justify-between bg-slate-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserCog className="w-6 h-6 text-primary" />
            Gestión de Usuarios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crea y administra los usuarios del sistema.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nuevo Usuario
        </Button>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="border rounded-md flex-1 overflow-auto shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Creado el</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Cargando usuarios...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                    No hay usuarios registrados.
                  </TableCell>
                </TableRow>
              ) : (
                users.map(u => (
                  <TableRow key={u.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${u.role === 'admin' ? 'bg-emerald-600' : 'bg-slate-400'}`}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">{u.username}</div>
                          {currentUser?.id === u.id && (
                            <div className="text-xs text-muted-foreground">(tú)</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.role === 'admin' ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1">
                          <ShieldCheck className="w-3 h-3" /> Administrador
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <User className="w-3 h-3" /> Empleado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(u.createdAt), "d MMM yyyy, h:mm a", { locale: es })}
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
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Nuevo Usuario</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-username">Nombre de Usuario *</Label>
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
              <Label>Rol *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: 'user' }))}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-sm font-medium ${form.role === 'user' ? 'border-primary bg-primary/5 text-primary' : 'border-muted text-muted-foreground hover:border-primary/40'}`}
                >
                  <User className="w-5 h-5" />
                  Empleado
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
              <p className="text-xs text-muted-foreground">
                {form.role === 'admin'
                  ? 'Acceso completo al sistema: ventas, inventario, productos y usuarios.'
                  : 'Acceso únicamente al Punto de Venta para procesar ventas.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creando...' : 'Crear Usuario'}
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
