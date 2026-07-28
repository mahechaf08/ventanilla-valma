import { useState } from 'react';
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
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowDownLeft, ArrowUpRight, Plus, Search } from 'lucide-react';
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
  const { data: products } = useListProducts();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    type: 'inbound' as InventoryMovementInputType,
    quantity: '1',
    reason: '',
    notes: ''
  });

  const createMovement = useCreateInventoryMovement();

  const handleSave = () => {
    if (!formData.productId || !formData.quantity) {
      toast.error('Product and Quantity are required');
      return;
    }

    const qty = parseInt(formData.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Quantity must be a positive integer');
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
        setFormData({
          productId: '', type: 'inbound', quantity: '1', reason: '', notes: ''
        });
        queryClient.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast.success('Inventory movement recorded');
      },
      onError: (err: any) => {
        toast.error(err.message || 'Failed to record movement');
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-6 border-b flex items-center justify-between bg-slate-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Movements</h1>
          <p className="text-sm text-muted-foreground mt-1">Track stock adjustments and restocks over time.</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Record Movement
        </Button>
      </div>

      <div className="p-6 flex-1 overflow-hidden flex flex-col">
        <div className="border rounded-md flex-1 overflow-auto shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[180px]">Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingMovements ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading movements...</TableCell>
                </TableRow>
              ) : movements?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No inventory movements recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                movements?.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap font-mono">
                      {format(new Date(movement.createdAt), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                    <TableCell>
                      {movement.type === 'inbound' ? (
                        <Badge className="bg-success text-success-foreground hover:bg-success/90 font-mono text-[10px] uppercase gap-1">
                          <ArrowDownLeft className="w-3 h-3" /> Inbound
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="font-mono text-[10px] uppercase gap-1">
                          <ArrowUpRight className="w-3 h-3" /> Outbound
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
            <DialogTitle>Record Inventory Movement</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Movement Type</Label>
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
                  Stock In
                </Label>
                <Label
                  className={`flex items-center justify-center gap-2 rounded-md border-2 border-muted bg-transparent p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer ${formData.type === 'outbound' ? 'border-destructive bg-destructive/5 text-destructive' : ''}`}
                >
                  <RadioGroupItem value="outbound" className="sr-only" />
                  <ArrowUpRight className="h-4 w-4" />
                  Stock Out
                </Label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Product</Label>
              <select 
                id="product" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.productId}
                onChange={e => setFormData({...formData, productId: e.target.value})}
              >
                <option value="" disabled>Select a product...</option>
                {products?.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Stock: {p.stockQuantity})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
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
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Input 
                id="reason" 
                placeholder="e.g. Supplier delivery, damaged goods..." 
                value={formData.reason}
                onChange={e => setFormData({...formData, reason: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea 
                id="notes" 
                placeholder="Reference numbers or details..." 
                className="resize-none h-20"
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMovement.isPending}>
              {createMovement.isPending ? 'Saving...' : 'Save Movement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
