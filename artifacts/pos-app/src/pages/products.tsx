import { useState } from 'react';
import { 
  useListProducts, 
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
  getListCategoriesQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Edit2, Trash2 } from 'lucide-react';
import { Product } from '@workspace/api-client-react/src/generated/api.schemas';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCOP } from '@/lib/currency';

export default function Products() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: products, isLoading } = useListProducts({ search });
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [formData, setFormData] = useState({
    name: '', sku: '', category: '', price: '', description: ''
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const handleOpenNew = () => {
    setEditingProduct(null);
    setFormData({ name: '', sku: '', category: '', price: '', description: '' });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.price.toString(),
      description: product.description || ''
    });
    setIsFormOpen(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.sku || !formData.category || !formData.price) {
      toast.error("Por favor complete todos los campos requeridos");
      return;
    }

    const payload = {
      name: formData.name,
      sku: formData.sku,
      category: formData.category,
      price: parseFloat(formData.price),
      description: formData.description || undefined
    };

    if (editingProduct) {
      updateProduct.mutate({
        id: editingProduct.id,
        data: payload
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setIsFormOpen(false);
          toast.success("Producto actualizado");
        }
      });
    } else {
      createProduct.mutate({
        data: payload
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setIsFormOpen(false);
          toast.success("Producto creado");
        }
      });
    }
  };

  const handleDelete = () => {
    if (!productToDelete) return;
    
    deleteProduct.mutate({ id: productToDelete.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setDeleteConfirmOpen(false);
        setProductToDelete(null);
        toast.success("Producto eliminado");
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-6 border-b flex items-center justify-between bg-slate-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de Productos</h1>
          <p className="text-sm text-muted-foreground mt-1">Administra tus artículos, precios y detalles.</p>
        </div>
        <Button onClick={handleOpenNew} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar Producto
        </Button>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="max-w-sm mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar productos..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="border rounded-md flex-1 overflow-auto bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Precio (COP)</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando productos...</TableCell>
                </TableRow>
              ) : products?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No se encontraron productos. Agrega uno para comenzar.
                  </TableCell>
                </TableRow>
              ) : (
                products?.map((product) => (
                  <TableRow key={product.id} className="group">
                    <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{product.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">{formatCOP(product.price)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={product.stockQuantity <= 0 ? "destructive" : product.stockQuantity < 10 ? "secondary" : "default"} className={product.stockQuantity > 9 ? "bg-success text-success-foreground hover:bg-success/90" : ""}>
                        {product.stockQuantity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(product)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                          setProductToDelete(product);
                          setDeleteConfirmOpen(true);
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] flex flex-col border-l">
          <SheetHeader>
            <SheetTitle>{editingProduct ? 'Editar Producto' : 'Agregar Nuevo Producto'}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del Producto *</Label>
              <Input id="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Café Premium en Grano" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input id="sku" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} placeholder="COF-001" className="font-mono text-sm uppercase" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Precio (COP) *</Label>
                <Input id="price" type="number" step="1000" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="25000" className="font-mono" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoría *</Label>
              <Input id="category" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="Bebidas" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción (Opcional)</Label>
              <Textarea 
                id="description" 
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                placeholder="Detalles del producto..."
                className="resize-none h-24"
              />
            </div>
            
            {!editingProduct && (
              <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm border border-blue-100 mt-6">
                <strong>Nota:</strong> La cantidad de stock inicial debe establecerse desde la página de Movimientos de Inventario después de crear el producto.
              </div>
            )}
          </div>
          <SheetFooter className="mt-auto pt-6 border-t">
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createProduct.isPending || updateProduct.isPending}>
              {editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto eliminará permanentemente el producto &ldquo;{productToDelete?.name}&rdquo;. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteProduct.isPending ? 'Eliminando...' : 'Eliminar Producto'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
