import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { SEED_PRODUCTS } from '@/data/seed';
import {
  DEFAULT_NEXT_IDS,
  KEYS,
  load,
  save,
  type NextIds,
} from '@/lib/storage';
import { dateKeyMatches, isDateKeyInRange, isSameLocalDay, toDateKey } from '@/lib/date';
import { normalizePayments, saleCashAmount, saleNonCashAmount } from '@/lib/payments';
import {
  connectRealtime,
  getDeviceId,
  publishCashClose,
  publishInventory,
  publishSale,
  RealtimeEvents,
  type CashCloseRealtimePayload,
  type InventoryRealtimePayload,
  type SaleRealtimePayload,
} from '@/lib/realtime';
import type {
  CashClose,
  CashCloseStatus,
  CashMovement,
  CustomerReturn,
  CustomerReturnItem,
  CustomerReturnReason,
  DashboardSummary,
  EmployeeConsumption,
  EmployeeConsumptionSummary,
  EmployeeDaySalesSummary,
  InventoryMovement,
  InventoryMovementType,
  PaymentMethod,
  Product,
  ProductInput,
  IncomeAnalytics,
  IncomeDayBreakdown,
  ProductPerformanceReport,
  ProductPerformanceRow,
  ProductUpdate,
  PurchaseOrder,
  PurchaseOrderItem,
  Sale,
  SaleItem,
  SalePayment,
  SupplierAccountSummary,
  SupplierInvoicePayment,
  SupplierInvoiceStockItem,
  SupplierProductProfitRow,
  SupplierProfitabilityReport,
  SupplierReturn,
  SupplierReturnItem,
  SupplierReturnSettlement,
} from '@/types';

function parseProductSuppliers(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => String(s).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeSupplierKey(name: string): string {
  return name.trim().toLowerCase();
}

function ensureProducts(): Product[] {
  const existing = load<Product[] | null>(KEYS.products, null);
  if (existing && existing.length > 0) return existing;
  save(KEYS.products, SEED_PRODUCTS);
  return SEED_PRODUCTS;
}

function ensureNextIds(): NextIds {
  const existing = load<Partial<NextIds> | null>(KEYS.nextIds, null);
  if (existing) {
    const merged: NextIds = { ...DEFAULT_NEXT_IDS, ...existing };
    save(KEYS.nextIds, merged);
    return merged;
  }
  const products = ensureProducts();
  const maxProductId = products.reduce((m, p) => Math.max(m, p.id), 0);
  const ids: NextIds = {
    ...DEFAULT_NEXT_IDS,
    product: Math.max(DEFAULT_NEXT_IDS.product, maxProductId + 1),
  };
  save(KEYS.nextIds, ids);
  return ids;
}

function generateInvoiceNumber(prefix = 'VV'): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${date}-${rand}`;
}

interface CreateSaleInput {
  customerName?: string;
  /** Required when `payments` is omitted (legacy / single method). */
  paymentMethod?: PaymentMethod;
  /** Split payment rows; when provided, amounts must cover the sale total. */
  payments?: SalePayment[];
  items: { productId: number; quantity: number; unitPrice?: number; productName?: string }[];
  cashier?: string;
  cashierUserId?: number | null;
  source?: Sale['source'];
  /** When true, stock was already deducted (e.g. employee consumption). */
  skipStockDeduction?: boolean;
}

interface CreateMovementInput {
  productId: number;
  type: InventoryMovementType;
  quantity: number;
  reason?: string;
  notes?: string;
}

interface RegisterConsumptionInput {
  employeeId: number;
  employeeName: string;
  items: { productId: number; quantity: number }[];
  registeredBy: string;
}

interface LiquidateInput {
  employeeId: number;
  /** Prefer the current username so the sale invoice shows the accurate name. */
  employeeName?: string;
  paymentMethod?: PaymentMethod;
  liquidatedBy: string;
}

interface PaySupplierInvoiceInput {
  supplierName: string;
  amount: number;
  employeeId: number;
  employeeName: string;
}

interface ReceiveSupplierStockInput {
  invoiceId: number;
  receivedBy: string;
  notes?: string;
  items: { productId: number; quantity: number }[];
}

interface SaveCashCloseInput {
  dateKey: string;
  openingFloat: number;
  countedCash: number;
  closedBy: string;
  closedByUserId: number;
  notes?: string;
}

interface CreatePurchaseOrderInput {
  supplierName: string;
  supplierNit?: string;
  invoiceNumber: string;
  purchaseDate: string;
  notes?: string;
  createdBy: string;
  createdByUserId: number;
  items: { productId: number; quantity: number; unitCost: number }[];
}

interface CreateCustomerReturnInput {
  saleId: number;
  reason: CustomerReturnReason;
  reasonNotes?: string;
  /** Quantity to return per sale line item id */
  items: { saleItemId: number; quantity: number }[];
  /** How the customer is refunded; cash hits the drawer. */
  refundMethod: PaymentMethod;
  processedBy: string;
  processedByUserId: number;
  /** Optional override when resolving original cashier user id. */
  originalCashierUserId?: number | null;
}

interface CreateSupplierReturnInput {
  supplierName: string;
  supplierNit?: string;
  referenceNumber?: string;
  settlement: SupplierReturnSettlement;
  notes?: string;
  createdBy: string;
  createdByUserId: number;
  items: { productId: number; quantity: number; unitCost: number }[];
}

/** Weighted average cost: ((stock * cost) + (qty * purchaseCost)) / (stock + qty) */
function weightedAverageCost(
  currentStock: number,
  currentCost: number | null | undefined,
  purchasedQty: number,
  purchaseCost: number,
): number {
  const stock = Math.max(0, currentStock);
  const cost = currentCost ?? 0;
  const totalUnits = stock + purchasedQty;
  if (totalUnits <= 0) return Math.round(purchaseCost);
  if (stock <= 0) return Math.round(purchaseCost);
  return Math.round((stock * cost + purchasedQty * purchaseCost) / totalUnits);
}

function profitFromPrice(price: number, cost: number | null): number | null {
  if (cost == null || price <= 0) return null;
  return Math.round(((price - cost) / price) * 10000) / 100;
}

interface DataContextType {
  products: Product[];
  sales: Sale[];
  movements: InventoryMovement[];
  consumptions: EmployeeConsumption[];
  cashMovements: CashMovement[];
  supplierInvoices: SupplierInvoicePayment[];
  cashCloses: CashClose[];
  purchaseOrders: PurchaseOrder[];
  customerReturns: CustomerReturn[];
  supplierReturns: SupplierReturn[];
  listProducts: (opts?: { search?: string; category?: string }) => Product[];
  listCategories: () => string[];
  createProduct: (input: ProductInput) => Product;
  updateProduct: (id: number, input: ProductUpdate) => Product;
  deleteProduct: (id: number) => void;
  setProductImage: (id: number, imagePath: string | null) => Product;
  createSale: (input: CreateSaleInput) => Sale;
  listSales: (opts?: { limit?: number; offset?: number }) => Sale[];
  listRecentSales: (limit?: number) => Sale[];
  createMovement: (input: CreateMovementInput) => InventoryMovement;
  getDashboardSummary: () => DashboardSummary;
  registerConsumption: (input: RegisterConsumptionInput) => EmployeeConsumption[];
  getEmployeeConsumptionSummaries: () => EmployeeConsumptionSummary[];
  getLiquidatedBatches: () => LiquidatedConsumptionBatch[];
  liquidateEmployeeAccount: (input: LiquidateInput) => Sale;
  paySupplierInvoice: (input: PaySupplierInvoiceInput) => SupplierInvoicePayment;
  listSupplierInvoices: () => SupplierInvoicePayment[];
  getSupplierAccountSummaries: () => SupplierAccountSummary[];
  receiveSupplierStock: (input: ReceiveSupplierStockInput) => SupplierInvoicePayment;
  listSalesByDate: (dateKey: string) => Sale[];
  getEmployeeDaySales: (dateKey: string, cashier?: string | null) => EmployeeDaySalesSummary[];
  getCashClosePreview: (dateKey: string, openingFloat: number) => {
    cashSales: number;
    otherSales: number;
    supplierCashRefunds: number;
    customerRefunds: number;
    cashExpenses: number;
    cashOuts: number;
    expectedCash: number;
  };
  getCashCloseForDate: (dateKey: string) => CashClose | null;
  saveCashClose: (input: SaveCashCloseInput) => CashClose;
  getProductPerformance: () => ProductPerformanceReport;
  getIncomeAnalytics: (fromKey: string, toKey: string) => IncomeAnalytics;
  listSupplierNames: () => string[];
  getSupplierProfitability: (
    supplierFilter: string | 'all',
    fromKey: string,
    toKey: string,
  ) => SupplierProfitabilityReport;
  createPurchaseOrder: (input: CreatePurchaseOrderInput) => PurchaseOrder;
  listPurchaseOrders: () => PurchaseOrder[];
  createCustomerReturn: (input: CreateCustomerReturnInput) => CustomerReturn;
  listCustomerReturns: (saleId?: number) => CustomerReturn[];
  createSupplierReturn: (input: CreateSupplierReturnInput) => SupplierReturn;
  listSupplierReturns: () => SupplierReturn[];
}

export interface LiquidatedConsumptionBatch {
  saleId: number;
  invoiceNumber: string;
  employeeId: number;
  employeeName: string;
  liquidatedAt: string;
  totalAmount: number;
  totalQuantity: number;
  items: EmployeeConsumption[];
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => ensureProducts());
  const [sales, setSales] = useState<Sale[]>(() => load(KEYS.sales, []));
  const [movements, setMovements] = useState<InventoryMovement[]>(() =>
    load(KEYS.movements, []),
  );
  const [consumptions, setConsumptions] = useState<EmployeeConsumption[]>(() =>
    load(KEYS.consumptions, []),
  );
  const [cashMovements, setCashMovements] = useState<CashMovement[]>(() =>
    load(KEYS.cashMovements, []),
  );
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoicePayment[]>(() =>
    load(KEYS.supplierInvoices, []),
  );
  const [cashCloses, setCashCloses] = useState<CashClose[]>(() => load(KEYS.cashCloses, []));
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() =>
    load(KEYS.purchaseOrders, []),
  );
  const [customerReturns, setCustomerReturns] = useState<CustomerReturn[]>(() =>
    load(KEYS.customerReturns, []),
  );
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[]>(() =>
    load(KEYS.supplierReturns, []),
  );
  const [nextIds, setNextIds] = useState<NextIds>(() => ensureNextIds());

  const persistIds = useCallback((ids: NextIds) => {
    setNextIds(ids);
    save(KEYS.nextIds, ids);
  }, []);

  const persistProducts = useCallback((next: Product[]) => {
    setProducts(next);
    save(KEYS.products, next);
  }, []);

  /** Always read the latest list from storage so sequential updates never clobber each other. */
  const readProducts = useCallback((): Product[] => {
    return load<Product[]>(KEYS.products, products);
  }, [products]);

  const readMovements = useCallback((): InventoryMovement[] => {
    return load<InventoryMovement[]>(KEYS.movements, movements);
  }, [movements]);

  const readNextIds = useCallback((): NextIds => {
    return load<NextIds>(KEYS.nextIds, nextIds);
  }, [nextIds]);

  const persistSales = useCallback((next: Sale[]) => {
    setSales(next);
    save(KEYS.sales, next);
  }, []);

  const persistMovements = useCallback((next: InventoryMovement[]) => {
    setMovements(next);
    save(KEYS.movements, next);
  }, []);

  const persistConsumptions = useCallback((next: EmployeeConsumption[]) => {
    setConsumptions(next);
    save(KEYS.consumptions, next);
  }, []);

  const persistCashMovements = useCallback((next: CashMovement[]) => {
    setCashMovements(next);
    save(KEYS.cashMovements, next);
  }, []);

  const persistSupplierInvoices = useCallback((next: SupplierInvoicePayment[]) => {
    setSupplierInvoices(next);
    save(KEYS.supplierInvoices, next);
  }, []);

  const persistCashCloses = useCallback((next: CashClose[]) => {
    setCashCloses(next);
    save(KEYS.cashCloses, next);
  }, []);

  const persistPurchaseOrders = useCallback((next: PurchaseOrder[]) => {
    setPurchaseOrders(next);
    save(KEYS.purchaseOrders, next);
  }, []);

  const persistCustomerReturns = useCallback((next: CustomerReturn[]) => {
    setCustomerReturns(next);
    save(KEYS.customerReturns, next);
  }, []);

  const persistSupplierReturns = useCallback((next: SupplierReturn[]) => {
    setSupplierReturns(next);
    save(KEYS.supplierReturns, next);
  }, []);

  const listProducts = useCallback(
    (opts?: { search?: string; category?: string }) => {
      let result = products;
      if (opts?.category) {
        result = result.filter((p) => p.category === opts.category);
      }
      if (opts?.search?.trim()) {
        const q = opts.search.trim().toLowerCase();
        result = result.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.reference ?? '').toLowerCase().includes(q) ||
            (p.barcode ?? '').toLowerCase().includes(q),
        );
      }
      return result;
    },
    [products],
  );

  const listCategories = useCallback(() => {
    return [...new Set(products.map((p) => p.category))].sort((a, b) =>
      a.localeCompare(b, 'es'),
    );
  }, [products]);

  const createProduct = useCallback(
    (input: ProductInput): Product => {
      const current = readProducts();
      if (current.some((p) => p.sku.toUpperCase() === input.sku.toUpperCase())) {
        throw new Error('Ya existe un producto con ese SKU');
      }
      const ids = readNextIds();
      const now = new Date().toISOString();
      const stockQuantity = Number(input.stockQuantity);
      const stock = Number.isFinite(stockQuantity) ? Math.max(0, Math.trunc(stockQuantity)) : 0;
      const product: Product = {
        id: ids.product,
        name: input.name,
        sku: input.sku.toUpperCase(),
        reference: input.reference ?? null,
        description: input.description ?? null,
        price: input.price,
        terminalPrice: input.terminalPrice ?? null,
        cost: input.cost ?? null,
        profitPercent: input.profitPercent ?? null,
        category: input.category,
        suggestedStock: input.suggestedStock ?? 0,
        imagePath: input.imagePath ?? null,
        suppliers: input.suppliers ?? '[]',
        barcode: input.barcode ?? null,
        stockQuantity: stock,
        createdAt: now,
        updatedAt: now,
      };
      persistProducts([...current, product]);

      const nextIdsState = { ...ids, product: ids.product + 1 };
      if (stock > 0) {
        const movement: InventoryMovement = {
          id: ids.movement,
          productId: product.id,
          productName: product.name,
          type: 'inbound',
          quantity: stock,
          reason: 'Inventario Inicial / Creación de Producto',
          notes: null,
          createdAt: now,
        };
        persistMovements([movement, ...readMovements()]);
        nextIdsState.movement = ids.movement + 1;
      }
      persistIds(nextIdsState);
      return product;
    },
    [readProducts, readMovements, readNextIds, persistProducts, persistMovements, persistIds],
  );

  const updateProduct = useCallback(
    (id: number, input: ProductUpdate): Product => {
      const currentList = readProducts();
      const idx = currentList.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error('Producto no encontrado');
      if (
        input.sku &&
        currentList.some(
          (p) => p.id !== id && p.sku.toUpperCase() === input.sku!.toUpperCase(),
        )
      ) {
        throw new Error('Ya existe un producto con ese SKU');
      }
      const current = currentList[idx];
      const nextStock =
        input.stockQuantity !== undefined
          ? (() => {
              const n = Number(input.stockQuantity);
              return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : current.stockQuantity;
            })()
          : current.stockQuantity;
      const updated: Product = {
        ...current,
        ...input,
        sku: input.sku ? input.sku.toUpperCase() : current.sku,
        suppliers: input.suppliers !== undefined ? input.suppliers : current.suppliers,
        stockQuantity: nextStock,
        updatedAt: new Date().toISOString(),
      };
      const next = [...currentList];
      next[idx] = updated;
      persistProducts(next);

      // Auto-log stock adjustments when stockQuantity is explicitly changed
      if (input.stockQuantity !== undefined) {
        const diff = nextStock - current.stockQuantity;
        if (diff !== 0) {
          const ids = readNextIds();
          const movement: InventoryMovement = {
            id: ids.movement,
            productId: updated.id,
            productName: updated.name,
            type: diff > 0 ? 'inbound' : 'outbound',
            quantity: Math.abs(diff),
            reason:
              diff > 0
                ? 'Ajuste / Reposición de cantidad'
                : 'Ajuste manual',
            notes: null,
            createdAt: new Date().toISOString(),
          };
          persistMovements([movement, ...readMovements()]);
          persistIds({ ...ids, movement: ids.movement + 1 });
        }
      }

      return updated;
    },
    [readProducts, readMovements, readNextIds, persistProducts, persistMovements, persistIds],
  );

  const deleteProduct = useCallback(
    (id: number) => {
      persistProducts(readProducts().filter((p) => p.id !== id));
    },
    [readProducts, persistProducts],
  );

  const setProductImage = useCallback(
    (id: number, imagePath: string | null): Product => {
      return updateProduct(id, { imagePath });
    },
    [updateProduct],
  );

  const createSale = useCallback(
    (input: CreateSaleInput): Sale => {
      if (!input.items.length) throw new Error('La venta no tiene artículos');

      let working = [...products];
      const lineItems: Omit<SaleItem, 'id' | 'saleId'>[] = [];

      for (const item of input.items) {
        const pIdx = working.findIndex((p) => p.id === item.productId);
        if (pIdx < 0 && !item.productName) throw new Error('Producto no encontrado');

        if (pIdx >= 0) {
          const product = working[pIdx];
          if (!input.skipStockDeduction) {
            if (item.quantity > product.stockQuantity) {
              throw new Error(`Cantidad insuficiente para ${product.name}`);
            }
            working[pIdx] = {
              ...product,
              stockQuantity: product.stockQuantity - item.quantity,
              updatedAt: new Date().toISOString(),
            };
          }
          const unitPrice = item.unitPrice ?? product.price;
          lineItems.push({
            productId: product.id,
            productName: item.productName ?? product.name,
            quantity: item.quantity,
            unitPrice,
            subtotal: unitPrice * item.quantity,
          });
        } else {
          const unitPrice = item.unitPrice ?? 0;
          lineItems.push({
            productId: item.productId,
            productName: item.productName!,
            quantity: item.quantity,
            unitPrice,
            subtotal: unitPrice * item.quantity,
          });
        }
      }

      const saleId = nextIds.sale;
      let saleItemId = nextIds.saleItem;
      const items: SaleItem[] = lineItems.map((li) => {
        const row: SaleItem = { ...li, id: saleItemId, saleId };
        saleItemId += 1;
        return row;
      });

      const total = items.reduce((s, i) => s + i.subtotal, 0);

      let paymentMethod: PaymentMethod = input.paymentMethod ?? 'other';
      let payments: SalePayment[] | undefined;
      let changeGiven = 0;

      if (input.payments && input.payments.length > 0) {
        const normalized = normalizePayments(input.payments, total);
        payments = normalized.payments;
        changeGiven = normalized.changeGiven;
        paymentMethod = normalized.primary;
      } else if (!input.paymentMethod) {
        throw new Error('Método de pago requerido');
      } else {
        payments = [{ method: input.paymentMethod, amount: total }];
      }

      const sale: Sale = {
        id: saleId,
        invoiceNumber: generateInvoiceNumber(
          input.source === 'employee_consumption' ? 'CONS' : 'VV',
        ),
        customerName: input.customerName?.trim() || null,
        total,
        paymentMethod,
        payments,
        changeGiven,
        status: 'completed',
        createdAt: new Date().toISOString(),
        cashier: input.cashier,
        cashierUserId: input.cashierUserId ?? null,
        items,
        source: input.source ?? 'pos',
      };

      if (!input.skipStockDeduction) {
        persistProducts(working);
      }
      persistSales([sale, ...sales]);
      persistIds({
        ...nextIds,
        sale: saleId + 1,
        saleItem: saleItemId,
      });
      publishSale({
        sale,
        products: input.skipStockDeduction ? undefined : working,
      });
      return sale;
    },
    [products, sales, nextIds, persistProducts, persistSales, persistIds],
  );

  const listSales = useCallback(
    (opts?: { limit?: number; offset?: number }) => {
      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? 50;
      return sales.slice(offset, offset + limit);
    },
    [sales],
  );

  const listRecentSales = useCallback(
    (limit = 5) => sales.slice(0, limit),
    [sales],
  );

  const createMovement = useCallback(
    (input: CreateMovementInput): InventoryMovement => {
      const currentProducts = readProducts();
      const pIdx = currentProducts.findIndex((p) => p.id === input.productId);
      if (pIdx < 0) throw new Error('Producto no encontrado');
      if (input.quantity <= 0) throw new Error('La cantidad debe ser positiva');

      const product = currentProducts[pIdx];
      const nextStock =
        input.type === 'inbound'
          ? product.stockQuantity + input.quantity
          : product.stockQuantity - input.quantity;

      if (nextStock < 0) {
        throw new Error('No hay cantidad suficiente para esta salida');
      }

      const updatedProducts = [...currentProducts];
      updatedProducts[pIdx] = {
        ...product,
        stockQuantity: nextStock,
        updatedAt: new Date().toISOString(),
      };

      const ids = readNextIds();
      const movement: InventoryMovement = {
        id: ids.movement,
        productId: product.id,
        productName: product.name,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason || null,
        notes: input.notes || null,
        createdAt: new Date().toISOString(),
      };

      persistProducts(updatedProducts);
      persistMovements([movement, ...readMovements()]);
      persistIds({ ...ids, movement: ids.movement + 1 });
      publishInventory({ movement, products: updatedProducts });
      return movement;
    },
    [readProducts, readMovements, readNextIds, persistProducts, persistMovements, persistIds],
  );

  const registerConsumption = useCallback(
    (input: RegisterConsumptionInput): EmployeeConsumption[] => {
      if (!input.items.length) {
        throw new Error('Agrega al menos un producto');
      }

      let working = [...products];
      const created: EmployeeConsumption[] = [];
      let consumptionId = nextIds.consumption;
      let movementId = nextIds.movement;
      const newMovements: InventoryMovement[] = [];

      for (const item of input.items) {
        if (item.quantity <= 0) {
          throw new Error('La cantidad debe ser positiva');
        }
        const pIdx = working.findIndex((p) => p.id === item.productId);
        if (pIdx < 0) throw new Error('Producto no encontrado');
        const product = working[pIdx];
        if (item.quantity > product.stockQuantity) {
          throw new Error(`Cantidad insuficiente para ${product.name}`);
        }

        working[pIdx] = {
          ...product,
          stockQuantity: product.stockQuantity - item.quantity,
          updatedAt: new Date().toISOString(),
        };

        created.push({
          id: consumptionId,
          employeeId: input.employeeId,
          employeeName: input.employeeName,
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.price,
          subtotal: product.price * item.quantity,
          status: 'pending',
          registeredBy: input.registeredBy,
          createdAt: new Date().toISOString(),
          liquidatedAt: null,
          saleId: null,
          invoiceNumber: null,
        });
        consumptionId += 1;

        newMovements.push({
          id: movementId,
          productId: product.id,
          productName: product.name,
          type: 'outbound',
          quantity: item.quantity,
          reason: 'Consumo de empleado',
          notes: `${input.employeeName} · registrado por ${input.registeredBy}`,
          createdAt: new Date().toISOString(),
        });
        movementId += 1;
      }

      persistProducts(working);
      persistConsumptions([...created, ...consumptions]);
      persistMovements([...newMovements, ...movements]);
      persistIds({
        ...nextIds,
        consumption: consumptionId,
        movement: movementId,
      });
      return created;
    },
    [
      products,
      consumptions,
      movements,
      nextIds,
      persistProducts,
      persistConsumptions,
      persistMovements,
      persistIds,
    ],
  );

  const getEmployeeConsumptionSummaries = useCallback((): EmployeeConsumptionSummary[] => {
    const pending = consumptions.filter((c) => c.status === 'pending');

    const byEmployee = new Map<number, EmployeeConsumptionSummary>();
    for (const row of pending) {
      const existing = byEmployee.get(row.employeeId);
      if (existing) {
        existing.items.push(row);
        existing.totalQuantity += row.quantity;
        existing.totalAmount += row.subtotal;
      } else {
        byEmployee.set(row.employeeId, {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          items: [row],
          totalQuantity: row.quantity,
          totalAmount: row.subtotal,
        });
      }
    }

    for (const summary of byEmployee.values()) {
      summary.items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    return [...byEmployee.values()].sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName, 'es'),
    );
  }, [consumptions]);

  const getLiquidatedBatches = useCallback((): LiquidatedConsumptionBatch[] => {
    const liquidated = consumptions.filter(
      (c) => c.status === 'liquidated' && c.saleId != null,
    );

    const bySale = new Map<number, LiquidatedConsumptionBatch>();
    for (const row of liquidated) {
      const saleId = row.saleId!;
      const existing = bySale.get(saleId);
      if (existing) {
        existing.items.push(row);
        existing.totalQuantity += row.quantity;
        existing.totalAmount += row.subtotal;
      } else {
        bySale.set(saleId, {
          saleId,
          invoiceNumber: row.invoiceNumber || `SALE-${saleId}`,
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          liquidatedAt: row.liquidatedAt || row.createdAt,
          totalAmount: row.subtotal,
          totalQuantity: row.quantity,
          items: [row],
        });
      }
    }

    for (const batch of bySale.values()) {
      batch.items.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }

    return [...bySale.values()].sort(
      (a, b) =>
        new Date(b.liquidatedAt).getTime() - new Date(a.liquidatedAt).getTime(),
    );
  }, [consumptions]);

  const liquidateEmployeeAccount = useCallback(
    (input: LiquidateInput): Sale => {
      const pending = consumptions.filter(
        (c) => c.status === 'pending' && c.employeeId === input.employeeId,
      );

      if (!pending.length) {
        throw new Error('No hay consumo pendiente para liquidar');
      }

      const aggregated = new Map<
        number,
        { productId: number; productName: string; quantity: number; unitPrice: number }
      >();
      for (const row of pending) {
        const existing = aggregated.get(row.productId);
        if (existing) {
          existing.quantity += row.quantity;
        } else {
          aggregated.set(row.productId, {
            productId: row.productId,
            productName: row.productName,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
          });
        }
      }

      const employeeName =
        input.employeeName?.trim() || pending[0].employeeName;
      const sale = createSale({
        customerName: employeeName,
        paymentMethod: input.paymentMethod ?? 'other',
        cashier: input.liquidatedBy,
        source: 'employee_consumption',
        skipStockDeduction: true,
        items: [...aggregated.values()].map((a) => ({
          productId: a.productId,
          productName: a.productName,
          quantity: a.quantity,
          unitPrice: a.unitPrice,
        })),
      });

      const now = new Date().toISOString();
      const pendingIds = new Set(pending.map((p) => p.id));
      const updated = consumptions.map((c) =>
        pendingIds.has(c.id)
          ? {
              ...c,
              employeeName,
              status: 'liquidated' as const,
              liquidatedAt: now,
              saleId: sale.id,
              invoiceNumber: sale.invoiceNumber,
            }
          : c,
      );
      persistConsumptions(updated);
      return sale;
    },
    [consumptions, createSale, persistConsumptions],
  );

  const paySupplierInvoice = useCallback(
    (input: PaySupplierInvoiceInput): SupplierInvoicePayment => {
      const supplierName = input.supplierName.trim();
      if (!supplierName) throw new Error('El nombre del proveedor es obligatorio');
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error('El valor de la factura debe ser mayor a 0');
      }

      const cashId = nextIds.cashMovement;
      const invoiceId = nextIds.supplierInvoice;
      const now = new Date().toISOString();

      const cash: CashMovement = {
        id: cashId,
        type: 'out',
        amount: input.amount,
        reason: `Pago factura · ${supplierName}`,
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        referenceType: 'supplier_invoice',
        referenceId: invoiceId,
        createdAt: now,
      };

      const invoice: SupplierInvoicePayment = {
        id: invoiceId,
        supplierName,
        amount: input.amount,
        paidByEmployeeId: input.employeeId,
        paidByEmployeeName: input.employeeName,
        createdAt: now,
        status: 'pending_stock',
        cashMovementId: cashId,
        stockReceivedAt: null,
        stockReceivedBy: null,
        stockNotes: null,
        stockItems: [],
      };

      persistCashMovements([cash, ...cashMovements]);
      persistSupplierInvoices([invoice, ...supplierInvoices]);
      persistIds({
        ...nextIds,
        cashMovement: cashId + 1,
        supplierInvoice: invoiceId + 1,
      });
      return invoice;
    },
    [
      nextIds,
      cashMovements,
      supplierInvoices,
      persistCashMovements,
      persistSupplierInvoices,
      persistIds,
    ],
  );

  const listSupplierInvoices = useCallback(
    () =>
      [...supplierInvoices].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [supplierInvoices],
  );

  const getSupplierAccountSummaries = useCallback((): SupplierAccountSummary[] => {
    const map = new Map<string, SupplierAccountSummary>();
    for (const inv of supplierInvoices) {
      const key = inv.supplierName.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.totalPaid += inv.amount;
        existing.paymentCount += 1;
        if (inv.status === 'pending_stock') existing.pendingStockCount += 1;
        if (new Date(inv.createdAt) > new Date(existing.lastPaymentAt)) {
          existing.lastPaymentAt = inv.createdAt;
          existing.supplierName = inv.supplierName;
        }
      } else {
        map.set(key, {
          supplierName: inv.supplierName,
          totalPaid: inv.amount,
          paymentCount: 1,
          pendingStockCount: inv.status === 'pending_stock' ? 1 : 0,
          lastPaymentAt: inv.createdAt,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName, 'es'),
    );
  }, [supplierInvoices]);

  const receiveSupplierStock = useCallback(
    (input: ReceiveSupplierStockInput): SupplierInvoicePayment => {
      const idx = supplierInvoices.findIndex((i) => i.id === input.invoiceId);
      if (idx < 0) throw new Error('Factura no encontrada');
      const invoice = supplierInvoices[idx];
      if (invoice.status === 'stock_received') {
        throw new Error('La cantidad de esta factura ya fue recibida');
      }
      if (!input.items.length) {
        throw new Error('Agrega al menos un producto recibido');
      }

      let working = [...products];
      let movementId = nextIds.movement;
      const newMovements: InventoryMovement[] = [];
      const stockItems: SupplierInvoiceStockItem[] = [];

      for (const item of input.items) {
        if (item.quantity <= 0) {
          throw new Error('Las cantidades deben ser positivas');
        }
        const pIdx = working.findIndex((p) => p.id === item.productId);
        if (pIdx < 0) throw new Error('Producto no encontrado');
        const product = working[pIdx];
        working[pIdx] = {
          ...product,
          stockQuantity: product.stockQuantity + item.quantity,
          updatedAt: new Date().toISOString(),
        };
        stockItems.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
        });
        newMovements.push({
          id: movementId,
          productId: product.id,
          productName: product.name,
          type: 'inbound',
          quantity: item.quantity,
          reason: `Recepción factura proveedor · ${invoice.supplierName}`,
          notes: `Factura #${invoice.id} · ${input.receivedBy}`,
          createdAt: new Date().toISOString(),
        });
        movementId += 1;
      }

      const updated: SupplierInvoicePayment = {
        ...invoice,
        status: 'stock_received',
        stockReceivedAt: new Date().toISOString(),
        stockReceivedBy: input.receivedBy,
        stockNotes: input.notes?.trim() || null,
        stockItems,
      };
      const nextInvoices = [...supplierInvoices];
      nextInvoices[idx] = updated;

      persistProducts(working);
      persistMovements([...newMovements, ...movements]);
      persistSupplierInvoices(nextInvoices);
      persistIds({ ...nextIds, movement: movementId });
      return updated;
    },
    [
      supplierInvoices,
      products,
      movements,
      nextIds,
      persistProducts,
      persistMovements,
      persistSupplierInvoices,
      persistIds,
    ],
  );

  const getDashboardSummary = useCallback((): DashboardSummary => {
    const completed = sales.filter((s) => s.status === 'completed');
    const todaySales = completed.filter((s) => isSameLocalDay(s.createdAt));
    const categories = new Set(products.map((p) => p.category));
    return {
      todayRevenue: todaySales.reduce((s, sale) => s + sale.total, 0),
      todaySalesCount: todaySales.length,
      totalProducts: products.length,
      totalCategories: categories.size,
      lowStockCount: products.filter((p) => p.stockQuantity <= 5).length,
      allTimeRevenue: completed.reduce((s, sale) => s + sale.total, 0),
      allTimeSalesCount: completed.length,
    };
  }, [products, sales]);

  const listSalesByDate = useCallback(
    (dateKey: string): Sale[] => {
      return sales
        .filter(
          (s) =>
            (s.status === 'completed' ||
              s.status === 'partially_returned' ||
              s.status === 'returned') &&
            dateKeyMatches(s.createdAt, dateKey),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [sales],
  );

  const getEmployeeDaySales = useCallback(
    (dateKey: string, cashier?: string | null): EmployeeDaySalesSummary[] => {
      const daySales = listSalesByDate(dateKey).filter((s) => s.source !== 'employee_consumption');
      const filtered = cashier
        ? daySales.filter((s) => (s.cashier || 'Sin asignar') === cashier)
        : daySales;

      const byCashier = new Map<string, Sale[]>();
      for (const sale of filtered) {
        const key = sale.cashier?.trim() || 'Sin asignar';
        const list = byCashier.get(key) ?? [];
        list.push(sale);
        byCashier.set(key, list);
      }

      return [...byCashier.entries()]
        .map(([name, cashierSales]) => ({
          cashier: name,
          totalAmount: cashierSales.reduce((sum, s) => sum + s.total, 0),
          transactionCount: cashierSales.length,
          productsSold: cashierSales.reduce(
            (sum, s) => sum + s.items.reduce((q, i) => q + i.quantity, 0),
            0,
          ),
          sales: cashierSales,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
    },
    [listSalesByDate],
  );

  const getCashClosePreview = useCallback(
    (dateKey: string, openingFloat: number) => {
      const daySales = listSalesByDate(dateKey).filter((s) => s.source !== 'employee_consumption');
      const cashSales = daySales.reduce((sum, s) => sum + saleCashAmount(s), 0);
      const otherSales = daySales.reduce((sum, s) => sum + saleNonCashAmount(s), 0);

      const dayMovements = cashMovements.filter((m) => dateKeyMatches(m.createdAt, dateKey));
      const supplierCashRefunds = dayMovements
        .filter((m) => m.type === 'in' && m.referenceType === 'supplier_return')
        .reduce((sum, m) => sum + m.amount, 0);
      const customerRefunds = dayMovements
        .filter((m) => m.type === 'out' && m.referenceType === 'customer_return')
        .reduce((sum, m) => sum + m.amount, 0);
      const cashExpenses = dayMovements
        .filter((m) => m.type === 'out' && m.referenceType !== 'customer_return')
        .reduce((sum, m) => sum + m.amount, 0);
      const cashOuts = customerRefunds + cashExpenses;
      const expectedCash = openingFloat + cashSales + supplierCashRefunds - cashOuts;

      return {
        cashSales,
        otherSales,
        supplierCashRefunds,
        customerRefunds,
        cashExpenses,
        cashOuts,
        expectedCash,
      };
    },
    [listSalesByDate, cashMovements],
  );

  const getCashCloseForDate = useCallback(
    (dateKey: string): CashClose | null => {
      return cashCloses.find((c) => c.dateKey === dateKey) ?? null;
    },
    [cashCloses],
  );

  const saveCashClose = useCallback(
    (input: SaveCashCloseInput): CashClose => {
      const openingFloat = Math.max(0, Math.round(Number(input.openingFloat) || 0));
      const countedCash = Math.max(0, Math.round(Number(input.countedCash) || 0));
      const preview = getCashClosePreview(input.dateKey, openingFloat);
      const difference = countedCash - preview.expectedCash;
      let status: CashCloseStatus = 'cuadrada';
      if (difference < 0) status = 'faltante';
      if (difference > 0) status = 'sobrante';

      const ids = load<NextIds>(KEYS.nextIds, nextIds);
      const existingIdx = cashCloses.findIndex((c) => c.dateKey === input.dateKey);
      const record: CashClose = {
        id: existingIdx >= 0 ? cashCloses[existingIdx].id : ids.cashClose,
        dateKey: input.dateKey,
        openingFloat,
        cashSales: preview.cashSales,
        otherSales: preview.otherSales,
        supplierCashRefunds: preview.supplierCashRefunds,
        customerRefunds: preview.customerRefunds,
        cashExpenses: preview.cashExpenses,
        cashOuts: preview.cashOuts,
        expectedCash: preview.expectedCash,
        countedCash,
        difference,
        status,
        closedBy: input.closedBy,
        closedByUserId: input.closedByUserId,
        notes: input.notes?.trim() || null,
        createdAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        const next = [...cashCloses];
        next[existingIdx] = record;
        persistCashCloses(next);
      } else {
        persistCashCloses([record, ...cashCloses]);
        persistIds({ ...ids, cashClose: ids.cashClose + 1 });
      }
      publishCashClose({ cashClose: record });
      return record;
    },
    [cashCloses, nextIds, getCashClosePreview, persistCashCloses, persistIds],
  );

  const getProductPerformance = useCallback((): ProductPerformanceReport => {
    const completed = sales.filter(
      (s) =>
        (s.status === 'completed' ||
          s.status === 'partially_returned' ||
          s.status === 'returned') &&
        s.source !== 'employee_consumption',
    );

    type Acc = { unitsSold: number; revenue: number; totalProfit: number };
    const byProduct = new Map<number, Acc>();

    for (const sale of completed) {
      for (const item of sale.items) {
        const returned = item.returnedQuantity ?? 0;
        const netQty = item.quantity - returned;
        if (netQty <= 0) continue;
        const product = products.find((p) => p.id === item.productId);
        const cost = product?.cost ?? 0;
        const lineProfit = (item.unitPrice - cost) * netQty;
        const lineRevenue = item.unitPrice * netQty;
        const prev = byProduct.get(item.productId) ?? {
          unitsSold: 0,
          revenue: 0,
          totalProfit: 0,
        };
        byProduct.set(item.productId, {
          unitsSold: prev.unitsSold + netQty,
          revenue: prev.revenue + lineRevenue,
          totalProfit: prev.totalProfit + lineProfit,
        });
      }
    }

    const rows: ProductPerformanceRow[] = products.map((p) => {
      const stats = byProduct.get(p.id) ?? {
        unitsSold: 0,
        revenue: 0,
        totalProfit: 0,
      };
      const avgMarginPercent =
        stats.revenue > 0
          ? Math.round((stats.totalProfit / stats.revenue) * 10000) / 100
          : p.cost != null && p.price > 0
            ? Math.round(((p.price - p.cost) / p.price) * 10000) / 100
            : p.profitPercent ?? null;

      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        cost: p.cost ?? null,
        unitsSold: stats.unitsSold,
        revenue: stats.revenue,
        totalProfit: Math.round(stats.totalProfit),
        avgMarginPercent,
        currentStock: p.stockQuantity,
      };
    });

    const withSales = rows.filter((r) => r.unitsSold > 0);
    const byName = (a: ProductPerformanceRow, b: ProductPerformanceRow) =>
      a.name.localeCompare(b.name, 'es');
    const TOP_N = 15;

    const topMostSold = [...withSales]
      .sort((a, b) => b.unitsSold - a.unitsSold || byName(a, b))
      .slice(0, TOP_N);
    const topMostProfitable = [...withSales]
      .sort((a, b) => b.totalProfit - a.totalProfit || byName(a, b))
      .slice(0, TOP_N);
    const topLeastSold = [...rows]
      .sort((a, b) => a.unitsSold - b.unitsSold || byName(a, b))
      .slice(0, TOP_N);
    // Lowest accumulated profit, then lowest margin %
    const leastProfitablePool = withSales.length > 0 ? withSales : rows;
    const topLeastProfitable = [...leastProfitablePool]
      .sort((a, b) => {
        if (a.totalProfit !== b.totalProfit) return a.totalProfit - b.totalProfit;
        const am = a.avgMarginPercent ?? Infinity;
        const bm = b.avgMarginPercent ?? Infinity;
        return am - bm || byName(a, b);
      })
      .slice(0, TOP_N);

    return {
      rows,
      topMostSold,
      topMostProfitable,
      topLeastSold,
      topLeastProfitable,
    };
  }, [products, sales]);

  const getIncomeAnalytics = useCallback(
    (fromKey: string, toKey: string): IncomeAnalytics => {
      const start = fromKey <= toKey ? fromKey : toKey;
      const end = fromKey <= toKey ? toKey : fromKey;

      const rangeSales = sales
        .filter(
          (s) =>
            (s.status === 'completed' ||
              s.status === 'partially_returned' ||
              s.status === 'returned') &&
            s.source !== 'employee_consumption' &&
            isDateKeyInRange(s.createdAt, start, end),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const costByProduct = new Map(products.map((p) => [p.id, p.cost ?? 0]));

      const saleNetRevenue = (sale: Sale): number =>
        sale.items.reduce((sum, item) => {
          const netQty = item.quantity - (item.returnedQuantity ?? 0);
          return sum + item.unitPrice * Math.max(0, netQty);
        }, 0);

      const saleProfit = (sale: Sale): number =>
        sale.items.reduce((sum, item) => {
          const netQty = item.quantity - (item.returnedQuantity ?? 0);
          if (netQty <= 0) return sum;
          const cost = costByProduct.get(item.productId) ?? 0;
          return sum + (item.unitPrice - cost) * netQty;
        }, 0);

      const byDay = new Map<string, IncomeDayBreakdown>();
      for (const sale of rangeSales) {
        const revenue = saleNetRevenue(sale);
        if (revenue <= 0 && sale.status === 'returned') continue;
        const key = toDateKey(sale.createdAt);
        const prev = byDay.get(key) ?? {
          dateKey: key,
          orderCount: 0,
          grossRevenue: 0,
          netProfit: 0,
          sales: [],
        };
        if (revenue > 0) prev.orderCount += 1;
        prev.grossRevenue += revenue;
        prev.netProfit += saleProfit(sale);
        prev.sales.push(sale);
        byDay.set(key, prev);
      }

      const days = [...byDay.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      const grossRevenue = rangeSales.reduce((sum, s) => sum + saleNetRevenue(s), 0);
      const netProfit = rangeSales.reduce((sum, s) => sum + saleProfit(s), 0);
      const orderCount = rangeSales.filter((s) => saleNetRevenue(s) > 0).length;

      return {
        fromKey: start,
        toKey: end,
        grossRevenue,
        netProfit,
        orderCount,
        averageTicket: orderCount > 0 ? Math.round(grossRevenue / orderCount) : 0,
        days,
      };
    },
    [products, sales],
  );

  const listSupplierNames = useCallback((): string[] => {
    const names = new Map<string, string>();
    for (const po of purchaseOrders) {
      const n = po.supplierName.trim();
      if (n) names.set(normalizeSupplierKey(n), n);
    }
    for (const p of products) {
      for (const s of parseProductSuppliers(p.suppliers)) {
        names.set(normalizeSupplierKey(s), s);
      }
    }
    for (const r of supplierReturns) {
      const n = r.supplierName.trim();
      if (n) names.set(normalizeSupplierKey(n), n);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [purchaseOrders, products, supplierReturns]);

  const getSupplierProfitability = useCallback(
    (
      supplierFilter: string | 'all',
      fromKey: string,
      toKey: string,
    ): SupplierProfitabilityReport => {
      const start = fromKey <= toKey ? fromKey : toKey;
      const end = fromKey <= toKey ? toKey : fromKey;
      const filterKey =
        supplierFilter === 'all' ? null : normalizeSupplierKey(supplierFilter);

      type PurchaseAcc = {
        units: number;
        costTotal: number;
        supplierName: string;
      };
      const purchasesByProduct = new Map<number, PurchaseAcc>();

      for (const po of purchaseOrders) {
        const poSupplier = po.supplierName.trim();
        if (!poSupplier) continue;
        if (filterKey && normalizeSupplierKey(poSupplier) !== filterKey) continue;
        const dateKey =
          po.purchaseDate?.length === 10 ? po.purchaseDate : toDateKey(po.createdAt);
        if (dateKey < start || dateKey > end) continue;

        for (const line of po.items) {
          const prev = purchasesByProduct.get(line.productId) ?? {
            units: 0,
            costTotal: 0,
            supplierName: poSupplier,
          };
          purchasesByProduct.set(line.productId, {
            units: prev.units + line.quantity,
            costTotal: prev.costTotal + line.lineTotal,
            supplierName: filterKey ? poSupplier : prev.supplierName || poSupplier,
          });
        }
      }

      // Products tagged with this supplier (catalog) even if no PO in range
      const catalogProductIds = new Set<number>();
      for (const p of products) {
        const tagged = parseProductSuppliers(p.suppliers);
        if (filterKey) {
          if (tagged.some((s) => normalizeSupplierKey(s) === filterKey)) {
            catalogProductIds.add(p.id);
          }
        } else if (tagged.length > 0) {
          catalogProductIds.add(p.id);
        }
      }
      for (const id of purchasesByProduct.keys()) catalogProductIds.add(id);

      // Historical purchases (any date) for attribution
      const historicalPurchaseProductIds = new Set<number>();
      for (const po of purchaseOrders) {
        if (filterKey && normalizeSupplierKey(po.supplierName) !== filterKey) continue;
        for (const line of po.items) historicalPurchaseProductIds.add(line.productId);
      }

      const isProductLinkedToFilter = (productId: number): boolean => {
        if (catalogProductIds.has(productId) || purchasesByProduct.has(productId)) return true;
        if (historicalPurchaseProductIds.has(productId)) return true;
        if (!filterKey) {
          const product = products.find((p) => p.id === productId);
          return parseProductSuppliers(product?.suppliers).length > 0;
        }
        return false;
      };

      type SaleAcc = { units: number; revenue: number };
      const salesByProduct = new Map<number, SaleAcc>();

      for (const sale of sales) {
        if (sale.source === 'employee_consumption') continue;
        if (sale.status === 'voided') continue;
        if (!isDateKeyInRange(sale.createdAt, start, end)) continue;

        for (const item of sale.items) {
          if (!isProductLinkedToFilter(item.productId)) continue;
          catalogProductIds.add(item.productId);

          const netQty = item.quantity - (item.returnedQuantity ?? 0);
          if (netQty <= 0) continue;
          const prev = salesByProduct.get(item.productId) ?? { units: 0, revenue: 0 };
          salesByProduct.set(item.productId, {
            units: prev.units + netQty,
            revenue: prev.revenue + item.unitPrice * netQty,
          });
        }
      }

      // Resolve unit cost for COGS: avg from period POs, else historical avg from supplier POs, else product.cost
      const resolveUnitCost = (productId: number): number => {
        const period = purchasesByProduct.get(productId);
        if (period && period.units > 0) {
          return Math.round(period.costTotal / period.units);
        }
        let units = 0;
        let costTotal = 0;
        for (const po of purchaseOrders) {
          if (filterKey && normalizeSupplierKey(po.supplierName) !== filterKey) continue;
          for (const line of po.items) {
            if (line.productId !== productId) continue;
            units += line.quantity;
            costTotal += line.lineTotal;
          }
        }
        if (units > 0) return Math.round(costTotal / units);
        const product = products.find((p) => p.id === productId);
        return product?.cost ?? 0;
      };

      const resolveSupplierLabel = (productId: number): string => {
        if (filterKey && supplierFilter !== 'all') return supplierFilter;
        const fromPurchase = purchasesByProduct.get(productId)?.supplierName;
        if (fromPurchase) return fromPurchase;
        const product = products.find((p) => p.id === productId);
        const tagged = parseProductSuppliers(product?.suppliers);
        if (tagged[0]) return tagged[0];
        for (const po of purchaseOrders) {
          if (po.items.some((li) => li.productId === productId)) {
            return po.supplierName.trim();
          }
        }
        return 'Sin proveedor';
      };

      const productIds = new Set<number>([
        ...catalogProductIds,
        ...purchasesByProduct.keys(),
        ...salesByProduct.keys(),
      ]);

      const rows: SupplierProductProfitRow[] = [];
      for (const productId of productIds) {
        const product = products.find((p) => p.id === productId);
        if (!product) continue;
        const purchase = purchasesByProduct.get(productId);
        const sold = salesByProduct.get(productId);
        const unitsPurchased = purchase?.units ?? 0;
        const unitsSold = sold?.units ?? 0;
        const purchaseCostTotal = purchase?.costTotal ?? 0;
        const grossRevenue = sold?.revenue ?? 0;
        if (unitsPurchased === 0 && unitsSold === 0) continue;

        const avgPurchaseUnitCost =
          unitsPurchased > 0
            ? Math.round(purchaseCostTotal / unitsPurchased)
            : resolveUnitCost(productId);
        const unitCostForCogs = resolveUnitCost(productId);
        const cogs = unitsSold * unitCostForCogs;
        const netProfit = grossRevenue - cogs;

        rows.push({
          productId,
          productName: product.name,
          sku: product.sku,
          supplierName: resolveSupplierLabel(productId),
          unitsPurchased,
          unitsSold,
          purchaseCostTotal,
          avgPurchaseUnitCost:
            unitsPurchased > 0 || unitCostForCogs > 0 ? avgPurchaseUnitCost : null,
          grossRevenue,
          cogs,
          netProfit,
          currentStock: product.stockQuantity,
        });
      }

      rows.sort(
        (a, b) =>
          b.netProfit - a.netProfit ||
          b.grossRevenue - a.grossRevenue ||
          a.productName.localeCompare(b.productName, 'es'),
      );

      const capitalInvested = rows.reduce((s, r) => s + r.purchaseCostTotal, 0);
      const grossRevenue = rows.reduce((s, r) => s + r.grossRevenue, 0);
      const cogs = rows.reduce((s, r) => s + r.cogs, 0);
      const netProfit = grossRevenue - cogs;
      const marginPercent =
        grossRevenue > 0
          ? Math.round((netProfit / grossRevenue) * 1000) / 10
          : null;
      const roiPercent =
        capitalInvested > 0
          ? Math.round((netProfit / capitalInvested) * 1000) / 10
          : marginPercent;

      return {
        supplierFilter,
        fromKey: start,
        toKey: end,
        capitalInvested,
        grossRevenue,
        cogs,
        netProfit,
        roiPercent,
        marginPercent,
        products: rows,
      };
    },
    [products, sales, purchaseOrders],
  );

  const createPurchaseOrder = useCallback(
    (input: CreatePurchaseOrderInput): PurchaseOrder => {
      const supplierName = input.supplierName.trim();
      const invoiceNumber = input.invoiceNumber.trim();
      if (!supplierName) throw new Error('El proveedor es requerido');
      if (!invoiceNumber) throw new Error('El número de factura es requerido');
      if (!input.purchaseDate) throw new Error('La fecha de compra es requerida');
      if (!input.items.length) throw new Error('Agrega al menos un producto');

      let working = readProducts();
      const ids = readNextIds();
      let movementId = ids.movement;
      const newMovements: InventoryMovement[] = [];
      const orderItems: PurchaseOrderItem[] = [];
      const seen = new Set<number>();

      for (const raw of input.items) {
        if (seen.has(raw.productId)) {
          throw new Error('Hay productos duplicados en la carga; consolídalos en una sola línea');
        }
        seen.add(raw.productId);

        const qty = Math.floor(Number(raw.quantity));
        const unitCost = Math.round(Number(raw.unitCost));
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error('Las cantidades deben ser enteros positivos');
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error('El costo de compra no puede ser negativo');
        }

        const pIdx = working.findIndex((p) => p.id === raw.productId);
        if (pIdx < 0) throw new Error('Producto no encontrado');
        const product = working[pIdx];
        const previousStock = product.stockQuantity;
        const previousCost = product.cost ?? null;
        const newStock = previousStock + qty;
        const newCost = weightedAverageCost(previousStock, previousCost, qty, unitCost);
        const newProfit = profitFromPrice(product.price, newCost);
        const tagged = parseProductSuppliers(product.suppliers);
        const alreadyLinked = tagged.some(
          (s) => normalizeSupplierKey(s) === normalizeSupplierKey(supplierName),
        );
        const nextSuppliers = alreadyLinked
          ? tagged
          : [supplierName, ...tagged];

        working[pIdx] = {
          ...product,
          stockQuantity: newStock,
          cost: newCost,
          profitPercent: newProfit,
          suppliers: JSON.stringify(nextSuppliers),
          updatedAt: new Date().toISOString(),
        };

        orderItems.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: qty,
          unitCost,
          lineTotal: qty * unitCost,
          previousStock,
          previousCost,
          newStock,
          newCost,
        });

        newMovements.push({
          id: movementId,
          productId: product.id,
          productName: product.name,
          type: 'inbound',
          quantity: qty,
          reason: `Carga de inventario · ${supplierName}`,
          notes: `Factura ${invoiceNumber} · costo unit. ${unitCost}`,
          createdAt: new Date().toISOString(),
        });
        movementId += 1;
      }

      const totalAmount = orderItems.reduce((s, i) => s + i.lineTotal, 0);
      const order: PurchaseOrder = {
        id: ids.purchaseOrder ?? 1,
        supplierName,
        supplierNit: input.supplierNit?.trim() || null,
        invoiceNumber,
        purchaseDate: input.purchaseDate,
        notes: input.notes?.trim() || null,
        status: 'completed',
        totalAmount,
        itemCount: orderItems.reduce((s, i) => s + i.quantity, 0),
        items: orderItems,
        createdBy: input.createdBy,
        createdByUserId: input.createdByUserId,
        createdAt: new Date().toISOString(),
      };

      persistProducts(working);
      if (newMovements.length) {
        persistMovements([...newMovements, ...readMovements()]);
      }
      persistPurchaseOrders([order, ...purchaseOrders]);
      persistIds({
        ...ids,
        purchaseOrder: (ids.purchaseOrder ?? 1) + 1,
        movement: movementId,
      });
      return order;
    },
    [
      purchaseOrders,
      readProducts,
      readMovements,
      readNextIds,
      persistProducts,
      persistMovements,
      persistPurchaseOrders,
      persistIds,
    ],
  );

  const listPurchaseOrders = useCallback(
    () =>
      [...purchaseOrders].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.id - a.id,
      ),
    [purchaseOrders],
  );

  const createCustomerReturn = useCallback(
    (input: CreateCustomerReturnInput): CustomerReturn => {
      if (!input.items.length) throw new Error('Selecciona al menos un artículo a devolver');

      const saleIdx = sales.findIndex((s) => s.id === input.saleId);
      if (saleIdx < 0) throw new Error('Venta no encontrada');
      const sale = sales[saleIdx];
      if (sale.source === 'employee_consumption') {
        throw new Error('No se pueden devolver liquidaciones de consumo');
      }
      if (sale.status === 'voided') throw new Error('La venta está anulada');
      if (sale.status === 'returned') throw new Error('Esta venta ya fue devuelta por completo');

      let workingProducts = readProducts();
      const ids = readNextIds();
      let movementId = ids.movement;
      const newMovements: InventoryMovement[] = [];
      const returnItems: CustomerReturnItem[] = [];
      const now = new Date().toISOString();

      const updatedSaleItems = sale.items.map((item) => ({ ...item }));

      for (const line of input.items) {
        const qty = Math.floor(Number(line.quantity));
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const itemIdx = updatedSaleItems.findIndex((i) => i.id === line.saleItemId);
        if (itemIdx < 0) throw new Error('Artículo de venta no encontrado');
        const item = updatedSaleItems[itemIdx];
        const already = item.returnedQuantity ?? 0;
        const remaining = item.quantity - already;
        if (qty > remaining) {
          throw new Error(
            `Solo se pueden devolver ${remaining} unidad(es) de ${item.productName}`,
          );
        }

        const pIdx = workingProducts.findIndex((p) => p.id === item.productId);
        if (pIdx < 0) throw new Error(`Producto no encontrado: ${item.productName}`);
        const product = workingProducts[pIdx];
        workingProducts[pIdx] = {
          ...product,
          stockQuantity: product.stockQuantity + qty,
          updatedAt: now,
        };

        const movement: InventoryMovement = {
          id: movementId,
          productId: product.id,
          productName: product.name,
          type: 'inbound',
          quantity: qty,
          reason: 'Devolución de cliente',
          notes: `Factura ${sale.invoiceNumber} · ${input.reason}`,
          createdAt: now,
        };
        newMovements.push(movement);
        movementId += 1;

        updatedSaleItems[itemIdx] = {
          ...item,
          returnedQuantity: already + qty,
        };
        returnItems.push({
          saleItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: qty,
          unitPrice: item.unitPrice,
          subtotal: item.unitPrice * qty,
        });
      }

      if (!returnItems.length) throw new Error('Selecciona al menos un artículo a devolver');

      const refundTotal = returnItems.reduce((sum, i) => sum + i.subtotal, 0);
      const refundCashAmount = input.refundMethod === 'cash' ? refundTotal : 0;
      const returnId = ids.customerReturn;
      const originalCashier = sale.cashier?.trim() || 'Sin asignar';
      const originalCashierUserId =
        input.originalCashierUserId ?? sale.cashierUserId ?? null;

      let cashMovementId: number | null = null;
      let nextCashId = ids.cashMovement;
      let nextCashMovements = cashMovements;

      if (refundCashAmount > 0) {
        cashMovementId = nextCashId;
        const cash: CashMovement = {
          id: cashMovementId,
          type: 'out',
          amount: refundCashAmount,
          reason: `Devolución cliente · ${sale.invoiceNumber} · vendido por ${originalCashier} · devuelto por ${input.processedBy}`,
          employeeId: input.processedByUserId,
          employeeName: input.processedBy,
          referenceType: 'customer_return',
          referenceId: returnId,
          createdAt: now,
        };
        nextCashMovements = [cash, ...cashMovements];
        nextCashId += 1;
      }

      const fullyReturned = updatedSaleItems.every(
        (i) => (i.returnedQuantity ?? 0) >= i.quantity,
      );
      const anyReturned = updatedSaleItems.some((i) => (i.returnedQuantity ?? 0) > 0);
      const updatedSale: Sale = {
        ...sale,
        items: updatedSaleItems,
        returnedTotal: (sale.returnedTotal ?? 0) + refundTotal,
        status: fullyReturned ? 'returned' : anyReturned ? 'partially_returned' : sale.status,
      };

      const customerReturn: CustomerReturn = {
        id: returnId,
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        reason: input.reason,
        reasonNotes: input.reasonNotes?.trim() || null,
        items: returnItems,
        refundTotal,
        refundCashAmount,
        refundMethod: input.refundMethod,
        originalCashier,
        originalCashierUserId,
        processedBy: input.processedBy,
        processedByUserId: input.processedByUserId,
        cashMovementId,
        movementIds: newMovements.map((m) => m.id),
        createdAt: now,
      };

      const nextSales = [...sales];
      nextSales[saleIdx] = updatedSale;

      persistProducts(workingProducts);
      persistMovements([...newMovements, ...readMovements()]);
      persistSales(nextSales);
      persistCustomerReturns([customerReturn, ...customerReturns]);
      if (refundCashAmount > 0) persistCashMovements(nextCashMovements);
      persistIds({
        ...ids,
        movement: movementId,
        customerReturn: returnId + 1,
        cashMovement: nextCashId,
      });
      publishSale({ sale: updatedSale, products: workingProducts });
      if (newMovements[0]) {
        publishInventory({ movement: newMovements[0], products: workingProducts });
      }
      return customerReturn;
    },
    [
      sales,
      cashMovements,
      customerReturns,
      readProducts,
      readMovements,
      readNextIds,
      persistProducts,
      persistMovements,
      persistSales,
      persistCustomerReturns,
      persistCashMovements,
      persistIds,
    ],
  );

  const listCustomerReturns = useCallback(
    (saleId?: number) => {
      const list = [...customerReturns].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return saleId == null ? list : list.filter((r) => r.saleId === saleId);
    },
    [customerReturns],
  );

  const createSupplierReturn = useCallback(
    (input: CreateSupplierReturnInput): SupplierReturn => {
      const supplierName = input.supplierName.trim();
      if (!supplierName) throw new Error('El proveedor es requerido');
      if (!input.items.length) throw new Error('Agrega al menos un producto');

      let working = readProducts();
      const ids = readNextIds();
      let movementId = ids.movement;
      const newMovements: InventoryMovement[] = [];
      const orderItems: SupplierReturnItem[] = [];
      const seen = new Set<number>();
      const now = new Date().toISOString();
      const returnId = ids.supplierReturn;

      for (const raw of input.items) {
        if (seen.has(raw.productId)) {
          throw new Error('Hay productos duplicados; consolídalos en una sola línea');
        }
        seen.add(raw.productId);

        const qty = Math.floor(Number(raw.quantity));
        const unitCost = Math.round(Number(raw.unitCost));
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error('Las cantidades deben ser enteros positivos');
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error('El costo unitario no puede ser negativo');
        }

        const pIdx = working.findIndex((p) => p.id === raw.productId);
        if (pIdx < 0) throw new Error('Producto no encontrado');
        const product = working[pIdx];
        if (qty > product.stockQuantity) {
          throw new Error(`Stock insuficiente para ${product.name}`);
        }

        const previousStock = product.stockQuantity;
        const newStock = previousStock - qty;
        working[pIdx] = {
          ...product,
          stockQuantity: newStock,
          updatedAt: now,
        };

        const movement: InventoryMovement = {
          id: movementId,
          productId: product.id,
          productName: product.name,
          type: 'outbound',
          quantity: qty,
          reason: 'Devolución a proveedor',
          notes: `${supplierName}${input.referenceNumber ? ` · Ref ${input.referenceNumber}` : ''}`,
          createdAt: now,
        };
        newMovements.push(movement);
        movementId += 1;

        orderItems.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: qty,
          unitCost,
          lineTotal: qty * unitCost,
          previousStock,
          newStock,
        });
      }

      const totalAmount = orderItems.reduce((sum, i) => sum + i.lineTotal, 0);
      let cashMovementId: number | null = null;
      let nextCashId = ids.cashMovement;
      let nextCashMovements = cashMovements;

      if (input.settlement === 'cash_refund' && totalAmount > 0) {
        cashMovementId = nextCashId;
        const cash: CashMovement = {
          id: cashMovementId,
          type: 'in',
          amount: totalAmount,
          reason: `Reembolso proveedor · ${supplierName}`,
          employeeId: input.createdByUserId,
          employeeName: input.createdBy,
          referenceType: 'supplier_return',
          referenceId: returnId,
          createdAt: now,
        };
        nextCashMovements = [cash, ...cashMovements];
        nextCashId += 1;
      }

      const supplierReturn: SupplierReturn = {
        id: returnId,
        supplierName,
        supplierNit: input.supplierNit?.trim() || null,
        referenceNumber: input.referenceNumber?.trim() || null,
        settlement: input.settlement,
        notes: input.notes?.trim() || null,
        items: orderItems,
        totalAmount,
        itemCount: orderItems.length,
        cashMovementId,
        movementIds: newMovements.map((m) => m.id),
        createdBy: input.createdBy,
        createdByUserId: input.createdByUserId,
        createdAt: now,
      };

      persistProducts(working);
      persistMovements([...newMovements, ...readMovements()]);
      persistSupplierReturns([supplierReturn, ...supplierReturns]);
      if (cashMovementId != null) persistCashMovements(nextCashMovements);
      persistIds({
        ...ids,
        movement: movementId,
        supplierReturn: returnId + 1,
        cashMovement: nextCashId,
      });
      if (newMovements[0]) {
        publishInventory({ movement: newMovements[0], products: working });
      }
      return supplierReturn;
    },
    [
      cashMovements,
      supplierReturns,
      readProducts,
      readMovements,
      readNextIds,
      persistProducts,
      persistMovements,
      persistSupplierReturns,
      persistCashMovements,
      persistIds,
    ],
  );

  const listSupplierReturns = useCallback(
    () =>
      [...supplierReturns].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.id - a.id,
      ),
    [supplierReturns],
  );

  const value = useMemo<DataContextType>(
    () => ({
      products,
      sales,
      movements,
      consumptions,
      cashMovements,
      supplierInvoices,
      cashCloses,
      purchaseOrders,
      customerReturns,
      supplierReturns,
      listProducts,
      listCategories,
      createProduct,
      updateProduct,
      deleteProduct,
      setProductImage,
      createSale,
      listSales,
      listRecentSales,
      createMovement,
      getDashboardSummary,
      registerConsumption,
      getEmployeeConsumptionSummaries,
      getLiquidatedBatches,
      liquidateEmployeeAccount,
      paySupplierInvoice,
      listSupplierInvoices,
      getSupplierAccountSummaries,
      receiveSupplierStock,
      listSalesByDate,
      getEmployeeDaySales,
      getCashClosePreview,
      getCashCloseForDate,
      saveCashClose,
      getProductPerformance,
      getIncomeAnalytics,
      listSupplierNames,
      getSupplierProfitability,
      createPurchaseOrder,
      listPurchaseOrders,
      createCustomerReturn,
      listCustomerReturns,
      createSupplierReturn,
      listSupplierReturns,
    }),
    [
      products,
      sales,
      movements,
      consumptions,
      cashMovements,
      supplierInvoices,
      cashCloses,
      purchaseOrders,
      customerReturns,
      supplierReturns,
      listProducts,
      listCategories,
      createProduct,
      updateProduct,
      deleteProduct,
      setProductImage,
      createSale,
      listSales,
      listRecentSales,
      createMovement,
      getDashboardSummary,
      registerConsumption,
      getEmployeeConsumptionSummaries,
      getLiquidatedBatches,
      liquidateEmployeeAccount,
      paySupplierInvoice,
      listSupplierInvoices,
      getSupplierAccountSummaries,
      receiveSupplierStock,
      listSalesByDate,
      getEmployeeDaySales,
      getCashClosePreview,
      getCashCloseForDate,
      saveCashClose,
      getProductPerformance,
      getIncomeAnalytics,
      listSupplierNames,
      getSupplierProfitability,
      createPurchaseOrder,
      listPurchaseOrders,
      createCustomerReturn,
      listCustomerReturns,
      createSupplierReturn,
      listSupplierReturns,
    ],
  );

  // Real-time sync across terminals via Socket.IO
  useEffect(() => {
    const deviceId = getDeviceId();
    const sock = connectRealtime();
    if (!sock) return;

    const onSale = (payload: SaleRealtimePayload | { source?: string; sale?: Sale }) => {
      const remote = payload as SaleRealtimePayload;
      if (remote.deviceId && remote.deviceId === deviceId) return;
      const sale = remote.sale;
      if (!sale?.invoiceNumber) return;

      let isUpdate = false;
      setSales((prev) => {
        const existingIdx = prev.findIndex(
          (s) => s.invoiceNumber === sale.invoiceNumber || s.id === sale.id,
        );
        isUpdate = existingIdx >= 0;
        if (isUpdate) {
          const next = [...prev];
          next[existingIdx] = sale;
          save(KEYS.sales, next);
          return next;
        }
        const next = [sale, ...prev];
        save(KEYS.sales, next);
        return next;
      });

      if (remote.products?.length) {
        persistProducts(remote.products);
      } else if (!isUpdate && sale.items?.length) {
        const current = load<Product[]>(KEYS.products, products);
        const next = current.map((p) => {
          const line = sale.items.find((i) => i.productId === p.id);
          if (!line) return p;
          return {
            ...p,
            stockQuantity: Math.max(0, p.stockQuantity - line.quantity),
            updatedAt: new Date().toISOString(),
          };
        });
        persistProducts(next);
      }
    };

    const onInventory = (
      payload: InventoryRealtimePayload | { source?: string; movement?: InventoryMovement },
    ) => {
      const remote = payload as InventoryRealtimePayload;
      if (remote.deviceId && remote.deviceId === deviceId) return;
      const movement = remote.movement;
      if (!movement) return;

      setMovements((prev) => {
        if (prev.some((m) => m.id === movement.id && m.createdAt === movement.createdAt)) {
          return prev;
        }
        const next = [movement, ...prev];
        save(KEYS.movements, next);
        return next;
      });

      if (remote.products?.length) {
        persistProducts(remote.products);
      } else {
        const current = load<Product[]>(KEYS.products, products);
        const pIdx = current.findIndex((p) => p.id === movement.productId);
        if (pIdx >= 0) {
          const p = current[pIdx];
          const delta = movement.type === 'inbound' ? movement.quantity : -movement.quantity;
          const next = [...current];
          next[pIdx] = {
            ...p,
            stockQuantity: Math.max(0, p.stockQuantity + delta),
            updatedAt: new Date().toISOString(),
          };
          persistProducts(next);
        }
      }
    };

    const onCash = (payload: CashCloseRealtimePayload) => {
      if (payload.deviceId && payload.deviceId === deviceId) return;
      const record = payload.cashClose;
      if (!record?.dateKey) return;
      setCashCloses((prev) => {
        const idx = prev.findIndex((c) => c.dateKey === record.dateKey);
        const next =
          idx >= 0
            ? prev.map((c, i) => (i === idx ? record : c))
            : [record, ...prev];
        save(KEYS.cashCloses, next);
        return next;
      });
    };

    sock.on(RealtimeEvents.SALE_CREATED, onSale);
    sock.on(RealtimeEvents.INVENTORY_UPDATED, onInventory);
    sock.on(RealtimeEvents.CASH_CLOSED, onCash);

    return () => {
      sock.off(RealtimeEvents.SALE_CREATED, onSale);
      sock.off(RealtimeEvents.INVENTORY_UPDATED, onInventory);
      sock.off(RealtimeEvents.CASH_CLOSED, onCash);
    };
  }, [persistProducts, products]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextType {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
