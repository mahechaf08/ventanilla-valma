import { useState, useRef, useEffect } from 'react';
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useListCategories,
  getListProductsQueryKey,
  getListCategoriesQueryKey,
} from '@workspace/api-client-react';
import type { Product } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, Edit2, Trash2, X, ImagePlus, Barcode, PackagePlus, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatCOP } from '@/lib/currency';

const apiBase = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Form state ─────────────────────────────────────────────────────────────────
interface FormState {
  name: string;
  sku: string;
  reference: string;
  description: string;
  category: string;
  cost: string;
  profitPercent: string;
  price: string;
  terminalPrice: string;
  suggestedStock: string;
  suppliers: string[];
  barcode: string;
}

const emptyForm = (): FormState => ({
  name: '', sku: '', reference: '', description: '', category: '',
  cost: '', profitPercent: '', price: '', terminalPrice: '',
  suggestedStock: '0', suppliers: [], barcode: '',
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function autoSku(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 12);
}

function calcPrice(cost: string, profit: string): string {
  const c = parseFloat(cost);
  const p = parseFloat(profit);
  if (isNaN(c) || isNaN(p) || c <= 0) return '';
  return Math.round(c * (1 + p / 100)).toString();
}

function parseNum(s: string): number | undefined {
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

function parseInt10(s: string): number {
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Products() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: products, isLoading } = useListProducts({ search });
  const { data: existingCategories } = useListCategories();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [supplierInput, setSupplierInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  // auto-calc price when cost or profit changes
  useEffect(() => {
    if (form.cost && form.profitPercent) {
      const suggested = calcPrice(form.cost, form.profitPercent);
      if (suggested) setForm(f => ({ ...f, price: suggested }));
    }
  }, [form.cost, form.profitPercent]);

  const set = (key: keyof FormState, value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleOpenNew = () => {
    setEditingProduct(null);
    setForm(emptyForm());
    setImageFile(null);
    setImagePreview(null);
    setSupplierInput('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setFormError(null);
    setEditingProduct(product);
    let parsedSuppliers: string[] = [];
    try { parsedSuppliers = JSON.parse(product.suppliers || '[]'); } catch {}
    setForm({
      name: product.name,
      sku: product.sku,
      reference: product.reference || '',
      description: product.description || '',
      category: product.category,
      cost: product.cost != null ? String(product.cost) : '',
      profitPercent: product.profitPercent != null ? String(product.profitPercent) : '',
      price: String(product.price),
      terminalPrice: product.terminalPrice != null ? String(product.terminalPrice) : '',
      suggestedStock: String(product.suggestedStock ?? 0),
      suppliers: parsedSuppliers,
      barcode: product.barcode || '',
    });
    setImageFile(null);
    setImagePreview(product.imagePath || null);
    setSupplierInput('');
    setIsFormOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Solo se permiten imágenes'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('La imagen no puede superar 8 MB'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleAddSupplier = () => {
    const v = supplierInput.trim();
    if (!v) return;
    if (form.suppliers.includes(v)) { toast.error('Este proveedor ya está agregado'); return; }
    setForm(f => ({ ...f, suppliers: [...f.suppliers, v] }));
    setSupplierInput('');
  };

  const handleRemoveSupplier = (s: string) =>
    setForm(f => ({ ...f, suppliers: f.suppliers.filter(x => x !== s) }));

  const uploadImageForProduct = async (productId: number) => {
    if (!imageFile) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('image', imageFile);
      const res = await fetch(`${apiBase}/api/products/${productId}/image`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Imagen: ${body.error || 'Error al subir'}`);
      }
    } catch (err: any) {
      toast.error(`Imagen: ${err?.message || 'Error de red'}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    setFormError(null);

    // ── Client-side validation ──────────────────────────────────────────────
    if (!form.name.trim()) { setFormError('El nombre del producto es obligatorio'); return; }
    if (!form.sku.trim()) { setFormError('El SKU es obligatorio'); return; }
    if (!form.category.trim()) { setFormError('La categoría es obligatoria'); return; }
    const priceVal = parseFloat(form.price);
    if (!form.price || isNaN(priceVal) || priceVal <= 0) {
      setFormError('El precio de venta debe ser un número mayor a 0'); return;
    }

    // ── Build payload with strict number parsing ────────────────────────────
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      reference: form.reference.trim() || undefined,
      description: form.description.trim() || undefined,
      category: form.category.trim(),
      cost: parseNum(form.cost),
      profitPercent: parseNum(form.profitPercent),
      price: priceVal,
      terminalPrice: parseNum(form.terminalPrice),
      suggestedStock: parseInt10(form.suggestedStock),
      suppliers: JSON.stringify(form.suppliers),
      barcode: form.barcode.trim() || undefined,
    };

    console.log('[Products] Sending product data:', payload);

    try {
      if (editingProduct) {
        await new Promise<void>((resolve, reject) => {
          updateProduct.mutate(
            { id: editingProduct.id, data: payload },
            {
              onSuccess: async (updated) => {
                console.log('[Products] Updated:', updated.id);
                if (imageFile) await uploadImageForProduct(updated.id);
                queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
                queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
                setIsFormOpen(false);
                toast.success('Producto actualizado correctamente');
                resolve();
              },
              onError: (err: any) => {
                reject(err);
              },
            }
          );
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          createProduct.mutate(
            { data: payload },
            {
              onSuccess: async (created) => {
                console.log('[Products] Created:', created.id);
                if (imageFile) await uploadImageForProduct(created.id);
                queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
                queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
                setIsFormOpen(false);
                setForm(emptyForm());
                setImageFile(null);
                setImagePreview(null);
                toast.success('Producto creado correctamente');
                resolve();
              },
              onError: (err: any) => {
                reject(err);
              },
            }
          );
        });
      }
    } catch (err: any) {
      console.error('[Products] Save error:', err);
      // Extract the most useful message from the ApiError or plain Error
      const serverMessage = err?.data?.error || err?.data?.message;
      const statusCode = err?.status ? ` (${err.status})` : '';
      const msg = serverMessage
        ? `${serverMessage}${statusCode}`
        : err?.message
        ? `${err.message}${statusCode}`
        : `Error inesperado al guardar el producto${statusCode}`;
      setFormError(msg);
    }
  };

  const handleDelete = () => {
    if (!productToDelete) return;
    deleteProduct.mutate(
      { id: productToDelete.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setDeleteConfirmOpen(false);
          setProductToDelete(null);
          toast.success('Producto eliminado');
        },
        onError: (err: any) => {
          toast.error(err?.message || 'Error al eliminar el producto');
        },
      }
    );
  };

  const isSaving = createProduct.isPending || updateProduct.isPending || uploadingImage;

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-6 border-b flex items-center justify-between bg-slate-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de Productos</h1>
          <p className="text-sm text-muted-foreground mt-1">Administra artículos, precios y detalles.</p>
        </div>
        <Button onClick={handleOpenNew} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar Producto
        </Button>
      </div>

      {/* Search + Table */}
      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="max-w-sm mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar productos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="border rounded-md flex-1 overflow-auto bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Cargando productos...
                  </TableCell>
                </TableRow>
              ) : !products?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No se encontraron productos. Agrega uno para comenzar.
                  </TableCell>
                </TableRow>
              ) : products.map(product => (
                <TableRow key={product.id} className="group">
                  <TableCell className="py-1">
                    {product.imagePath ? (
                      <img src={product.imagePath} alt="" className="w-8 h-8 rounded object-cover border" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                        <PackagePlus className="w-4 h-4 text-slate-300" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                  <TableCell>
                    <div className="font-medium">{product.name}</div>
                    {product.reference && (
                      <div className="text-xs text-muted-foreground">Ref: {product.reference}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{product.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {product.cost != null ? formatCOP(product.cost) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCOP(product.price)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={product.stockQuantity <= 0 ? 'destructive' : 'default'}
                      className={
                        product.stockQuantity > 9
                          ? 'bg-emerald-100 text-emerald-800 border-0'
                          : product.stockQuantity > 0
                          ? 'bg-amber-100 text-amber-800 border-0'
                          : ''
                      }
                    >
                      {product.stockQuantity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => handleOpenEdit(product)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        onClick={() => { setProductToDelete(product); setDeleteConfirmOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Product Form Sheet ── */}
      <Sheet open={isFormOpen} onOpenChange={open => { if (!isSaving) setIsFormOpen(open); }}>
        <SheetContent className="w-full sm:max-w-2xl flex flex-col border-l p-0">
          <SheetHeader className="px-6 py-4 border-b bg-slate-50">
            <SheetTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-primary" />
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* ── Identificación ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Identificación
              </p>
              <div className="grid gap-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">
                    Nombre del Producto <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={e => {
                      set('name', e.target.value);
                      if (!editingProduct && !form.sku) set('sku', autoSku(e.target.value));
                    }}
                    placeholder="ej: Auriculares Sony WH-1000XM5"
                    autoComplete="off"
                  />
                </div>

                {/* SKU + Reference */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-sku">
                      SKU <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="p-sku"
                      value={form.sku}
                      onChange={e => set('sku', e.target.value.toUpperCase())}
                      placeholder="AUR-001"
                      className="font-mono text-sm"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-ref">Referencia</Label>
                    <Input
                      id="p-ref"
                      value={form.reference}
                      onChange={e => set('reference', e.target.value)}
                      placeholder="REF-XM5"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Category combobox */}
                <div className="space-y-1.5">
                  <Label htmlFor="p-cat">
                    Categoría <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="p-cat"
                      value={form.category}
                      onChange={e => { set('category', e.target.value); setCategoryOpen(true); }}
                      onFocus={() => setCategoryOpen(true)}
                      onBlur={() => setTimeout(() => setCategoryOpen(false), 150)}
                      placeholder="Selecciona o escribe una categoría"
                      autoComplete="off"
                    />
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    {categoryOpen && existingCategories && existingCategories.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border rounded-md shadow-lg max-h-44 overflow-auto">
                        {existingCategories
                          .filter(c => !form.category || c.toLowerCase().includes(form.category.toLowerCase()))
                          .map(c => (
                            <button
                              key={c}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 capitalize"
                              onMouseDown={() => { set('category', c); setCategoryOpen(false); }}
                            >
                              {c}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Barcode */}
                <div className="space-y-1.5">
                  <Label htmlFor="p-barcode" className="flex items-center gap-1.5">
                    <Barcode className="w-4 h-4" /> Código de Barras
                  </Label>
                  <Input
                    id="p-barcode"
                    value={form.barcode}
                    onChange={e => set('barcode', e.target.value)}
                    placeholder="Escanea o escribe el código"
                    className="font-mono"
                    autoComplete="off"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="p-desc">Descripción</Label>
                  <Textarea
                    id="p-desc"
                    value={form.description}
                    onChange={e => set('description', e.target.value)}
                    placeholder="Descripción opcional del producto..."
                    className="resize-none h-20"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Precios ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Precios y Costos
              </p>
              <div className="grid gap-4">
                {/* Cost + Profit */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-cost">Costo (COP)</Label>
                    <Input
                      id="p-cost"
                      type="number"
                      step="100"
                      min="0"
                      value={form.cost}
                      onChange={e => set('cost', e.target.value)}
                      placeholder="ej: 80000"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-profit">% Ganancia</Label>
                    <div className="relative">
                      <Input
                        id="p-profit"
                        type="number"
                        step="1"
                        min="0"
                        max="999"
                        value={form.profitPercent}
                        onChange={e => set('profitPercent', e.target.value)}
                        placeholder="ej: 40"
                        className="font-mono pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {form.cost && form.profitPercent && (
                  <p className="text-xs text-emerald-600 bg-emerald-50 rounded px-3 py-2">
                    💡 Precio sugerido calculado automáticamente:{' '}
                    <strong>
                      {formatCOP(parseFloat(calcPrice(form.cost, form.profitPercent) || '0'))}
                    </strong>
                  </p>
                )}

                {/* Price + Terminal Price */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-price">
                      Precio de Venta (COP) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="p-price"
                      type="number"
                      step="100"
                      min="0"
                      value={form.price}
                      onChange={e => set('price', e.target.value)}
                      placeholder="ej: 120000"
                      className="font-mono font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-terminal">Precio Terminal (COP)</Label>
                    <Input
                      id="p-terminal"
                      type="number"
                      step="100"
                      min="0"
                      value={form.terminalPrice}
                      onChange={e => set('terminalPrice', e.target.value)}
                      placeholder="ej: 115000"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Inventario ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Inventario
              </p>
              <div className="space-y-1.5 max-w-xs">
                <Label htmlFor="p-stock">Stock Sugerido</Label>
                <Input
                  id="p-stock"
                  type="number"
                  step="1"
                  min="0"
                  value={form.suggestedStock}
                  onChange={e => set('suggestedStock', e.target.value)}
                  placeholder="0"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  El stock real se ajusta desde la página de Inventario.
                </p>
              </div>
            </div>

            <Separator />

            {/* ── Proveedores ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Proveedor(es)
              </p>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={supplierInput}
                    onChange={e => setSupplierInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAddSupplier(); }
                    }}
                    placeholder="Nombre del proveedor..."
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={handleAddSupplier} className="shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {form.suppliers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.suppliers.map(s => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 rounded-full px-3 py-1 text-sm"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => handleRemoveSupplier(s)}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* ── Imagen ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Imagen del Producto
              </p>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />

              {imagePreview ? (
                <div className="flex items-start gap-4">
                  <div className="relative w-28 h-28 rounded-lg overflow-hidden border shadow-sm shrink-0">
                    <img src={imagePreview} alt="Vista previa" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {imageFile ? `Archivo: ${imageFile.name}` : 'Imagen actual'}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => imageInputRef.current?.click()}
                      className="gap-1.5"
                    >
                      <ImagePlus className="w-4 h-4" /> Cambiar imagen
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/50 transition-colors"
                >
                  <ImagePlus className="w-8 h-8 opacity-50" />
                  <span className="text-sm font-medium">Haz clic para subir una imagen</span>
                  <span className="text-xs">PNG, JPG, WEBP hasta 8 MB</span>
                </button>
              )}
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t bg-slate-50 flex-col gap-2">
            {formError && (
              <div className="w-full rounded-md bg-red-50 border border-red-200 px-4 py-2.5 flex items-start gap-2 text-sm text-red-700">
                <span className="mt-0.5 shrink-0">⚠️</span>
                <span>{formError}</span>
              </div>
            )}
            <div className="flex w-full justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setIsFormOpen(false); setFormError(null); }}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="min-w-32">
                {isSaving
                  ? 'Guardando...'
                  : editingProduct
                  ? 'Guardar Cambios'
                  : 'Crear Producto'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente <strong>{productToDelete?.name}</strong>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProduct.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
