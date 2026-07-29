import { useState, useRef, useEffect } from 'react';
import { 
  useListInventoryMovements, 
  useCreateInventoryMovement,
  useListProducts,
  getListInventoryMovementsQueryKey,
  getListProductsQueryKey,
  getGetDashboardSummaryQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowDownLeft, ArrowUpRight, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { InventoryMovementInputType } from '@workspace/api-client-react/src/generated/api.schemas';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

export default function Inventory() {
  const queryClient = useQueryClient();
  const { data: movements, isLoading: isLoadingMovements } = useListInventoryMovements({});
  const { data: products, isLoading: isLoadingProducts } = useListProducts();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    type: 'inbound' as InventoryMovementInputType,
    quantity: '1',
    reason: '',
    notes: ''
  });

  // ── Product combobox state ─────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [selectedProductLabel, setSelectedProductLabel] = useState('');
  const productInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        productInputRef.current && !productInputRef.current.contains(e.target as Node)
      ) {
        setProductDropdownOpen(false);
        // Restore label if user typed but didn't select
        if (formData.productId) setProductSearch(selectedProductLabel);
        else setProductSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [formData.productId, selectedProductLabel]);

  const filteredProducts = (products ?? []).filter(p => {
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.reference ?? '').toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    );
  });

  const handleSelectProduct = (p: { id: number; name: string; stockQuantity: number }) => {
    const label = p.name;
    setFormData(f => ({ ...f, productId: String(p.id) }));
    setSelectedProductLabel(label);
    setProductSearch(label);
    setProductDropdownOpen(false);
  };

  const handleClearProduct = () => {
    setFormData(f => ({ ...f, productId: '' }));
    setSelectedProductLabel('');
    setProductSearch('');
    productInputRef.current?.focus();
  };

  const resetForm = () => {
    setFormData({ productId: '', type: 'inbound', quantity: '1', reason: '', notes: '' });
    setProductSearch('');
    setSelectedProductLabel('');
    setProductDropdownOpen(false);
  };

  const createMovement = useCreateInventoryMovement();

  const handleSave = () => {
    if (!formData.productId || !formData.quantity) {
      toast.error('El producto y la cantidad son requeridos');
      return;
    }

    const qty = parseInt(formData.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error('La cantidad debe ser un número entero positivo');
      return;
    }

    createMovement.mutate({
      data: {
        productId: parseInt(formData.productId, 10),
        type: formData.type,
        quantity: qty,
        reason: formData.reason || undefined,
        notes: formData.notes || undefined
      }
    }, {
      onSuccess: () => {
        setIsFormOpen(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast.success('Movimiento de inventario registrado');
      },
      onError: (err: any) => {
        toast.error(err.message || 'Error al registrar el movimiento');
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-6 border-b flex items-center justify-between bg-slate-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Movimientos de Inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">Registra ajustes de stock y reposiciones a lo largo del tiempo.</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Registrar Movimiento
        </Button>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="border rounded-md flex-1 overflow-auto shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[180px]">Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingMovements ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando movimientos...</TableCell>
                </TableRow>
              ) : movements?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No hay movimientos de inventario registrados aún.
                  </TableCell>
                </TableRow>
              ) : (
                movements?.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap font-mono">
                      {format(new Date(movement.createdAt), "d MMM yyyy, h:mm a", { locale: es })}
                    </TableCell>
                    <TableCell>
                      {movement.type === 'inbound' ? (
                        <Badge className="bg-success text-success-foreground hover:bg-success/90 font-mono text-[10px] uppercase gap-1">
                          <ArrowDownLeft className="w-3 h-3" /> Entrada
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="font-mono text-[10px] uppercase gap-1">
                          <ArrowUpRight className="w-3 h-3" /> Salida
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{movement.productName}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {movement.type === 'inbound' ? '+' : '-'}{movement.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {movement.reason || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento de Inventario</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de Movimiento</Label>
              <RadioGroup 
                value={formData.type} 
                onValueChange={(v) => setFormData({...formData, type: v as InventoryMovementInputType})} 
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  className={`flex items-center justify-center gap-2 rounded-md border-2 border-muted bg-transparent p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer ${formData.type === 'inbound' ? 'border-success bg-success/5 text-success-foreground' : ''}`}
                >
                  <RadioGroupItem value="inbound" className="sr-only" />
                  <ArrowDownLeft className="h-4 w-4" />
                  Entrada de Stock
                </Label>
                <Label
                  className={`flex items-center justify-center gap-2 rounded-md border-2 border-muted bg-transparent p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer ${formData.type === 'outbound' ? 'border-destructive bg-destructive/5 text-destructive' : ''}`}
                >
                  <RadioGroupItem value="outbound" className="sr-only" />
                  <ArrowUpRight className="h-4 w-4" />
                  Salida de Stock
                </Label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-search">Producto</Label>
              <div className="relative">
                {/* Input */}
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
                <input
                  ref={productInputRef}
                  id="product-search"
                  type="text"
                  autoComplete="off"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder={isLoadingProducts ? 'Cargando productos...' : 'Buscar por nombre, SKU o código...'}
                  value={productSearch}
                  onChange={e => {
                    setProductSearch(e.target.value);
                    setFormData(f => ({ ...f, productId: '' }));
                    setSelectedProductLabel('');
                    setProductDropdownOpen(true);
                  }}
                  onFocus={() => setProductDropdownOpen(true)}
                />
                {/* Clear button */}
                {(productSearch || formData.productId) && (
                  <button
                    type="button"
                    onClick={handleClearProduct}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Dropdown */}
                {productDropdownOpen && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto"
                  >
                    {filteredProducts.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                        {isLoadingProducts ? 'Cargando...' : 'No se encontraron productos'}
                      </div>
                    ) : (
                      filteredProducts.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => handleSelectProduct(p)}
                          className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors ${formData.productId === String(p.id) ? 'bg-blue-50 text-blue-700' : ''}`}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{p.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{p.sku}</span>
                          </div>
                          <span className={`shrink-0 text-xs font-mono px-2 py-0.5 rounded-full ${p.stockQuantity <= 0 ? 'bg-red-100 text-red-700' : p.stockQuantity < 10 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {p.stockQuantity} en stock
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* Show selected product confirmation */}
              {formData.productId && selectedProductLabel && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Seleccionado: <strong>{selectedProductLabel}</strong>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="qty">Cantidad</Label>
              <Input 
                id="qty" 
                type="number" 
                min="1" 
                className="font-mono"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Motivo (Opcional)</Label>
              <Input 
                id="reason" 
                placeholder="ej. Entrega de proveedor, mercancía dañada..." 
                value={formData.reason}
                onChange={e => setFormData({...formData, reason: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notas Adicionales</Label>
              <Textarea 
                id="notes" 
                placeholder="Números de referencia o detalles..." 
                className="resize-none h-20"
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMovement.isPending}>
              {createMovement.isPending ? 'Guardando...' : 'Guardar Movimiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
