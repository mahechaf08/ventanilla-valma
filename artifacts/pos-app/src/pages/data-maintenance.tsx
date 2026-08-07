import { useMemo, useState } from 'react';
import { Redirect } from 'wouter';
import {
  AlertTriangle,
  DatabaseBackup,
  Eraser,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useData, type PurgeScope } from '@/contexts/data-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const CONFIRM_WORD = 'BORRAR';

type PurgeAction = {
  scope: PurgeScope;
  title: string;
  description: string;
  details: string[];
  icon: React.ComponentType<{ className?: string }>;
  danger: 'high' | 'critical';
  allowRestoreStock: boolean;
};

const ACTIONS: PurgeAction[] = [
  {
    scope: 'sales',
    title: 'Borrar Historial de Ventas',
    description:
      'Elimina todas las facturas, ítems de venta, devoluciones de cliente y métricas asociadas.',
    details: [
      'Ventas e ítems de factura',
      'Devoluciones de cliente',
      'Métricas de ventas en Registro / Historial',
      'Copia compartida en Neon (todos los PCs)',
    ],
    icon: ReceiptText,
    danger: 'high',
    allowRestoreStock: true,
  },
  {
    scope: 'cash',
    title: 'Borrar Registros / Cierres de Caja',
    description:
      'Elimina el historial de cierres de caja y los movimientos de efectivo registrados.',
    details: [
      'Cierres de caja diarios',
      'Movimientos de caja (entradas / salidas / gastos)',
    ],
    icon: Wallet,
    danger: 'high',
    allowRestoreStock: false,
  },
  {
    scope: 'full',
    title: 'Reiniciar Todos los Registros de Ventas',
    description:
      'Limpieza completa de transacciones: ventas, devoluciones, gastos de caja y sesiones de caja.',
    details: [
      'Ventas y devoluciones de cliente',
      'Devoluciones a proveedor',
      'Cierres y movimientos de caja',
      'Ledger compartido en Neon',
      'No elimina productos, categorías, usuarios ni proveedores',
    ],
    icon: DatabaseBackup,
    danger: 'critical',
    allowRestoreStock: true,
  },
];

export default function DataMaintenancePage() {
  const { user, verifyCurrentPassword } = useAuth();
  const { sales, cashCloses, cashMovements, customerReturns, purgeTransactionalData } =
    useData();

  const [selected, setSelected] = useState<PurgeAction | null>(null);
  const [confirmWord, setConfirmWord] = useState('');
  const [password, setPassword] = useState('');
  const [restoreStock, setRestoreStock] = useState(false);
  const [running, setRunning] = useState(false);

  const counts = useMemo(
    () => ({
      sales: sales.length,
      returns: customerReturns.length,
      cashCloses: cashCloses.length,
      cashMovements: cashMovements.length,
    }),
    [sales, customerReturns, cashCloses, cashMovements],
  );

  if (!user || user.role !== 'admin') {
    return <Redirect to="/" />;
  }

  const openModal = (action: PurgeAction) => {
    setSelected(action);
    setConfirmWord('');
    setPassword('');
    setRestoreStock(false);
  };

  const closeModal = () => {
    if (running) return;
    setSelected(null);
    setConfirmWord('');
    setPassword('');
    setRestoreStock(false);
  };

  const canSubmit =
    !!selected &&
    confirmWord.trim().toUpperCase() === CONFIRM_WORD &&
    password.length > 0 &&
    !running;

  const handleConfirm = async () => {
    if (!selected || !user) return;
    if (confirmWord.trim().toUpperCase() !== CONFIRM_WORD) {
      toast.error(`Escribe ${CONFIRM_WORD} para confirmar`);
      return;
    }
    if (!verifyCurrentPassword(password)) {
      toast.error('Contraseña de administrador incorrecta');
      return;
    }

    setRunning(true);
    try {
      const result = await purgeTransactionalData({
        scope: selected.scope,
        restoreStock: selected.allowRestoreStock ? restoreStock : false,
        username: user.username,
        password,
        confirmation: confirmWord,
      });

      const parts = [
        `Eliminado: ${result.localCleared.join(', ') || 'datos locales'}`,
      ];
      if (result.stockRestoredUnits > 0) {
        parts.push(`${result.stockRestoredUnits} uds. restauradas al inventario`);
      }
      if (result.neon.ok) {
        parts.push(
          result.neon.posSalesDeleted != null
            ? `Neon: ${result.neon.posSalesDeleted} ventas remotas`
            : 'Neon sincronizado',
        );
      } else if (result.neon.error) {
        parts.push(`Aviso Neon: ${result.neon.error}`);
      }

      toast.success(parts.join(' · '));
      setSelected(null);
      setConfirmWord('');
      setPassword('');
      setRestoreStock(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la limpieza');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <Eraser className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Solo administradores
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Limpieza de Datos
          </h1>
          <p className="text-slate-500 mt-1">
            Borra historial de ventas y registros transaccionales. Los productos, categorías,
            usuarios y proveedores no se eliminan.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="pt-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-950 space-y-1">
              <p className="font-medium">Esta acción es irreversible.</p>
              <p className="text-amber-900/80">
                Estado actual: {counts.sales} ventas · {counts.returns} devoluciones cliente ·{' '}
                {counts.cashCloses} cierres · {counts.cashMovements} movimientos de caja.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.scope}
                className={cn(
                  'border-slate-200',
                  action.danger === 'critical' && 'border-red-200',
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div
                        className={cn(
                          'p-2.5 rounded-lg',
                          action.danger === 'critical'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700',
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{action.title}</CardTitle>
                        <CardDescription className="mt-1">{action.description}</CardDescription>
                      </div>
                    </div>
                    <Button
                      variant={action.danger === 'critical' ? 'destructive' : 'outline'}
                      className="shrink-0"
                      onClick={() => openModal(action)}
                    >
                      Ejecutar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
                    {action.details.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Confirmar limpieza</DialogTitle>
            <DialogDescription>
              {selected?.title}. Escribe <strong>{CONFIRM_WORD}</strong> y tu contraseña de
              administrador para continuar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="purge-confirm">
                Escribe {CONFIRM_WORD} para confirmar
              </Label>
              <Input
                id="purge-confirm"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
                disabled={running}
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purge-password">Contraseña de administrador</Label>
              <Input
                id="purge-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                disabled={running}
              />
            </div>
            {selected?.allowRestoreStock && (
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                <Checkbox
                  checked={restoreStock}
                  onCheckedChange={(v) => setRestoreStock(v === true)}
                  disabled={running}
                  className="mt-0.5"
                />
                <span className="text-sm text-slate-700 leading-snug">
                  Restaurar stock de inventario al eliminar las ventas
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Devuelve al inventario las unidades vendidas aún no devueltas.
                  </span>
                </span>
              </label>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeModal} disabled={running}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canSubmit}
              onClick={() => void handleConfirm()}
            >
              {running ? 'Eliminando…' : 'Eliminar definitivamente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
