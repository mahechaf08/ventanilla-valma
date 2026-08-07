import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/data-context';
import { cn } from '@/lib/utils';

type SyncSalesButtonProps = {
  className?: string;
  /** Compact outline style for page headers */
  variant?: 'outline' | 'ghost';
};

export function SyncSalesButton({
  className,
  variant = 'outline',
}: SyncSalesButtonProps) {
  const { syncSalesFromServer, isSyncingSales } = useData();

  const handleSync = async () => {
    try {
      const result = await syncSalesFromServer();
      if (result.merged > 0) {
        toast.success(
          result.merged === 1
            ? '1 venta sincronizada desde el servidor'
            : `${result.merged} ventas sincronizadas desde el servidor`,
        );
      } else {
        toast.success('Ventas al día (Neon)');
      }
    } catch {
      toast.error('No se pudo sincronizar con Neon. Verifica VITE_SOCKET_URL / API.');
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={cn('gap-2', className)}
      onClick={() => void handleSync()}
      disabled={isSyncingSales}
      title="Sincronizar ventas desde el servidor"
    >
      <RefreshCw className={cn('w-4 h-4', isSyncingSales && 'animate-spin')} />
      Sincronizar
    </Button>
  );
}
