export type Role = 'admin' | 'user';

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'nequi'
  | 'daviplata'
  | 'transfer'
  | 'other';

export type SaleStatus = 'completed' | 'voided' | 'partially_returned' | 'returned';

export type InventoryMovementType = 'inbound' | 'outbound';

export type CustomerReturnReason =
  | 'defective'
  | 'exchange'
  | 'customer_request'
  | 'other';

export type SupplierReturnSettlement = 'cash_refund' | 'store_credit';

export interface User {
  id: number;
  username: string;
  password: string;
  role: Role;
  createdAt: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  reference?: string | null;
  description?: string | null;
  price: number;
  terminalPrice?: number | null;
  cost?: number | null;
  profitPercent?: number | null;
  category: string;
  suggestedStock: number;
  imagePath?: string | null;
  suppliers: string;
  barcode?: string | null;
  stockQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductInput = Omit<
  Product,
  'id' | 'stockQuantity' | 'createdAt' | 'updatedAt' | 'imagePath'
> & {
  stockQuantity?: number;
  imagePath?: string | null;
};

export type ProductUpdate = Partial<ProductInput>;

export interface SaleItem {
  id: number;
  saleId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** Units already returned (cumulative). */
  returnedQuantity?: number;
}

export interface SalePayment {
  method: PaymentMethod;
  amount: number;
}

export interface Sale {
  id: number;
  invoiceNumber: string;
  customerName?: string | null;
  total: number;
  /** Primary / legacy single method (largest slice when mixed). */
  paymentMethod: PaymentMethod;
  /** Split payment allocations; optional for older localStorage records. */
  payments?: SalePayment[];
  /** Change returned when tendered amount exceeds total. */
  changeGiven?: number;
  status: SaleStatus;
  createdAt: string;
  cashier?: string;
  /** User id of the original cashier when known. */
  cashierUserId?: number | null;
  items: SaleItem[];
  source?: 'pos' | 'employee_consumption';
  /** Cumulative cash/value refunded via customer returns. */
  returnedTotal?: number;
}

export interface InventoryMovement {
  id: number;
  productId: number;
  productName: string;
  type: InventoryMovementType;
  quantity: number;
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  todayRevenue: number;
  todaySalesCount: number;
  totalProducts: number;
  totalCategories: number;
  lowStockCount: number;
  allTimeRevenue: number;
  allTimeSalesCount: number;
}

export type ConsumptionStatus = 'pending' | 'liquidated';

export interface EmployeeConsumption {
  id: number;
  employeeId: number;
  employeeName: string;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  status: ConsumptionStatus;
  registeredBy: string;
  createdAt: string;
  /** @deprecated Kept for older localStorage records; liquidation ignores periods. */
  periodKey?: string;
  liquidatedAt?: string | null;
  saleId?: number | null;
  invoiceNumber?: string | null;
}

export interface EmployeeConsumptionSummary {
  employeeId: number;
  employeeName: string;
  items: EmployeeConsumption[];
  totalQuantity: number;
  totalAmount: number;
}

export type CashMovementType = 'in' | 'out';

export interface CashMovement {
  id: number;
  type: CashMovementType;
  amount: number;
  reason: string;
  employeeId: number;
  employeeName: string;
  referenceType?: 'supplier_invoice' | 'customer_return' | 'supplier_return' | null;
  referenceId?: number | null;
  createdAt: string;
}

export type SupplierInvoiceStatus = 'pending_stock' | 'stock_received';

export interface SupplierInvoiceStockItem {
  productId: number;
  productName: string;
  quantity: number;
}

export interface SupplierInvoicePayment {
  id: number;
  supplierName: string;
  amount: number;
  paidByEmployeeId: number;
  paidByEmployeeName: string;
  createdAt: string;
  status: SupplierInvoiceStatus;
  cashMovementId: number;
  stockReceivedAt?: string | null;
  stockReceivedBy?: string | null;
  stockNotes?: string | null;
  stockItems?: SupplierInvoiceStockItem[];
}

export interface SupplierAccountSummary {
  supplierName: string;
  totalPaid: number;
  paymentCount: number;
  pendingStockCount: number;
  lastPaymentAt: string;
}

export type CashCloseStatus = 'cuadrada' | 'faltante' | 'sobrante';

export interface CashClose {
  id: number;
  /** Local calendar day YYYY-MM-DD */
  dateKey: string;
  openingFloat: number;
  cashSales: number;
  otherSales: number;
  /** Cash refunds received from suppliers (drawer in). */
  supplierCashRefunds: number;
  /** Cash refunded to customers (drawer out). */
  customerRefunds: number;
  /** Other cash outs (e.g. supplier invoice payments). */
  cashExpenses: number;
  /** Total cash outs = customerRefunds + cashExpenses (legacy field). */
  cashOuts: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  status: CashCloseStatus;
  closedBy: string;
  closedByUserId: number;
  notes?: string | null;
  createdAt: string;
}

export interface EmployeeDaySalesSummary {
  cashier: string;
  totalAmount: number;
  transactionCount: number;
  productsSold: number;
  sales: Sale[];
}

export interface ProductPerformanceRow {
  productId: number;
  name: string;
  sku: string;
  category: string;
  cost: number | null;
  unitsSold: number;
  revenue: number;
  totalProfit: number;
  /** Average margin % based on sold lines: profit / revenue * 100 */
  avgMarginPercent: number | null;
  currentStock: number;
}

export interface ProductPerformanceReport {
  rows: ProductPerformanceRow[];
  topMostSold: ProductPerformanceRow[];
  topMostProfitable: ProductPerformanceRow[];
  topLeastSold: ProductPerformanceRow[];
  topLeastProfitable: ProductPerformanceRow[];
}

export interface IncomeDayBreakdown {
  dateKey: string;
  orderCount: number;
  grossRevenue: number;
  netProfit: number;
  sales: Sale[];
}

export interface IncomeAnalytics {
  fromKey: string;
  toKey: string;
  grossRevenue: number;
  netProfit: number;
  orderCount: number;
  averageTicket: number;
  days: IncomeDayBreakdown[];
}

export type PurchaseOrderStatus = 'completed';

export interface PurchaseOrderItem {
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  previousStock: number;
  previousCost: number | null;
  newStock: number;
  newCost: number;
}

export interface PurchaseOrder {
  id: number;
  supplierName: string;
  supplierNit?: string | null;
  invoiceNumber: string;
  purchaseDate: string;
  notes?: string | null;
  status: PurchaseOrderStatus;
  totalAmount: number;
  itemCount: number;
  items: PurchaseOrderItem[];
  createdBy: string;
  createdByUserId: number;
  createdAt: string;
}

export interface CustomerReturnItem {
  saleItemId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface CustomerReturn {
  id: number;
  saleId: number;
  invoiceNumber: string;
  reason: CustomerReturnReason;
  reasonNotes?: string | null;
  items: CustomerReturnItem[];
  refundTotal: number;
  /** Portion refunded in cash (hits cash drawer). */
  refundCashAmount: number;
  refundMethod: PaymentMethod;
  /** Original sale cashier (Vendido por). */
  originalCashier: string;
  originalCashierUserId: number | null;
  /** Logged-in user who processed the refund (Devuelto por). */
  processedBy: string;
  processedByUserId: number;
  cashMovementId?: number | null;
  movementIds: number[];
  createdAt: string;
}

export interface SupplierReturnItem {
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  previousStock: number;
  newStock: number;
}

export interface SupplierReturn {
  id: number;
  supplierName: string;
  supplierNit?: string | null;
  referenceNumber?: string | null;
  settlement: SupplierReturnSettlement;
  notes?: string | null;
  items: SupplierReturnItem[];
  totalAmount: number;
  itemCount: number;
  cashMovementId?: number | null;
  movementIds: number[];
  createdBy: string;
  createdByUserId: number;
  createdAt: string;
}
