import { formatDistanceToNow, isToday, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import type { Role, User as AppUser } from '@/types';
import {
  Edit2,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  UserCog,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

type UserForm = {
  username: string;
  password: string;
  role: Role;
};

const emptyForm = (): UserForm => ({
  username: '',
  password: '',
  role: 'user',
});

function formatLastLogin(iso: string | null | undefined): string {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Nunca';
  const relative = formatDistanceToNow(d, { addSuffix: true, locale: es });
  if (isToday(d)) {
    return `Hoy, ${format(d, 'h:mm a', { locale: es })} · ${relative}`;
  }
  return `${format(d, "d MMM yyyy, h:mm a", { locale: es })} · ${relative}`;
}

function StatusBadges({
  user,
  isOnline,
  isSelf,
}: {
  user: AppUser;
  isOnline: boolean;
  isSelf: boolean;
}) {
  const enabled = user.enabled !== false;
  return (
    <div className="flex flex-col gap-1.5">
      {enabled ? (
        <Badge className="w-fit bg-emerald-100 text-emerald-800 border-0 gap-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Activo
        </Badge>
      ) : (
        <Badge className="w-fit bg-red-100 text-red-800 border-0 gap-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Deshabilitado
        </Badge>
      )}
      {enabled && (isOnline || isSelf) ? (
        <Badge
          variant="outline"
          className="w-fit border-emerald-300 text-emerald-800 bg-emerald-50 gap-1.5 font-medium"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          En línea
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="w-fit border-slate-200 text-slate-600 bg-slate-50 gap-1.5 font-medium"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          Desconectado
        </Badge>
      )}
    </div>
  );
}

export default function UsersPage() {
  const {
    user: currentUser,
    listUsers,
    createUser,
    updateUser,
    setUserEnabled,
    deleteUser,
    onlineUserIds,
  } = useAuth();
  const users = listUsers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (u: AppUser) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      password: '',
      role: u.role,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.username.trim()) {
      toast.error('El nombre de usuario es obligatorio');
      return;
    }
    if (!editingUser && !form.password) {
      toast.error('Completa todos los campos');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        updateUser(editingUser.id, {
          username: form.username.trim(),
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success('Usuario actualizado');
      } else {
        createUser({
          username: form.username.trim(),
          password: form.password,
          role: form.role,
        });
        toast.success('Usuario registrado exitosamente');
      }
      setDialogOpen(false);
      setEditingUser(null);
      setForm(emptyForm());
    } catch (err: any) {
      toast.error(
        err?.message ||
          (editingUser ? 'Error al actualizar usuario' : 'Error al crear usuario'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      deleteUser(deleteTarget.id);
      toast.success('Usuario eliminado');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Error al eliminar usuario');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleEnabled = (u: AppUser, enabled: boolean) => {
    try {
      setUserEnabled(u.id, enabled);
      toast.success(
        enabled
          ? `Cuenta de ${u.username} habilitada`
          : `Cuenta de ${u.username} deshabilitada`,
      );
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo cambiar el estado');
    }
  };

  const admins = users.filter((u) => u.role === 'admin');
  const employees = users.filter((u) => u.role === 'user');
  const onlineCount = users.filter(
    (u) => onlineUserIds.includes(u.id) || currentUser?.id === u.id,
  ).length;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <UserCog className="w-6 h-6 text-primary" />
              Gestión de Usuarios
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crea, edita, habilita o deshabilita accesos al sistema Ventanilla Valma.
            </p>
          </div>

          <Button
            onClick={openCreate}
            size="lg"
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md"
          >
            <UserPlus className="w-5 h-5" />
            Registrar nuevo usuario
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>
              {admins.length} administrador{admins.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span>
              {employees.length} empleado{employees.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              {onlineCount} en línea ahora
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col gap-4">
        <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Última Conexión</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16">
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
                users.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  const isOnline = onlineUserIds.includes(u.id) || isSelf;
                  const enabled = u.enabled !== false;
                  return (
                    <TableRow
                      key={u.id}
                      className={cn('group', !enabled && 'bg-slate-50/80 opacity-90')}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'relative w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0',
                              u.role === 'admin' ? 'bg-blue-600' : 'bg-slate-400',
                            )}
                          >
                            {u.username.charAt(0).toUpperCase()}
                            {isOnline && enabled && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{u.username}</div>
                            {isSelf && (
                              <div className="text-xs text-blue-600 font-medium">
                                tú · sesión actual
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.role === 'admin' ? (
                          <Badge className="bg-amber-500 text-slate-900 border-0 gap-1 font-medium">
                            <ShieldCheck className="w-3 h-3" /> Administrador
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <User className="w-3 h-3" /> Empleado (cajero)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadges user={u} isOnline={isOnline} isSelf={isSelf} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatLastLogin(u.lastLoginAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={enabled}
                            disabled={isSelf}
                            onCheckedChange={(checked) =>
                              handleToggleEnabled(u, checked === true)
                            }
                            aria-label={
                              enabled
                                ? `Deshabilitar ${u.username}`
                                : `Habilitar ${u.username}`
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {enabled ? 'Habilitada' : 'Off'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(u)}
                            title="Editar usuario"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeleteTarget(u)}
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div
          className="border-2 border-dashed border-blue-200 rounded-lg p-4 flex items-center justify-between bg-blue-50/50 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
          onClick={openCreate}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800">Registrar nuevo usuario</p>
              <p className="text-xs text-blue-600">Añade un cajero o administrador al sistema</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            <UserPlus className="w-4 h-4" /> Registrar
          </Button>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingUser(null);
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingUser ? (
                <>
                  <Edit2 className="w-5 h-5 text-blue-600" />
                  Editar usuario
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  Registrar nuevo usuario
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-username">Nombre de usuario *</Label>
              <Input
                id="user-username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="ej: Maria Garcia"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">
                Contraseña {editingUser ? '(dejar en blanco para no cambiar)' : '*'}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de acceso *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: 'user' }))}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-sm font-medium ${form.role === 'user' ? 'border-primary bg-primary/5 text-primary' : 'border-muted text-muted-foreground hover:border-primary/40'}`}
                >
                  <User className="w-5 h-5" />
                  Empleado (cajero)
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: 'admin' }))}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-sm font-medium ${form.role === 'admin' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-muted text-muted-foreground hover:border-blue-400'}`}
                >
                  <ShieldCheck className="w-5 h-5" />
                  Administrador
                </button>
              </div>
              <p className="text-xs text-muted-foreground bg-slate-50 border border-slate-200 rounded-lg rounded-xl p-2">
                {form.role === 'admin'
                  ? 'Acceso completo: ventas, inventario, productos y usuarios.'
                  : 'Acceso a POS, facturas, pagos y consumo propio.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {editingUser ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {saving
                ? 'Guardando...'
                : editingUser
                  ? 'Guardar cambios'
                  : 'Registrar usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la cuenta de{' '}
              <strong>{deleteTarget?.username}</strong>. Esta acción no se puede deshacer.
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
