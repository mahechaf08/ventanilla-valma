import { cn } from '@/lib/utils';

export function BrandMark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'lg' ? 'w-14 h-14 text-lg' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm';

  return (
    <div
      className={cn(
        'rounded-xl bg-blue-600 text-white font-bold tracking-wide flex items-center justify-center shadow-sm select-none',
        sizeClass,
        className,
      )}
      aria-label="Ventanilla Valma"
    >
      VM
    </div>
  );
}
