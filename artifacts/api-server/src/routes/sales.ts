import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, inventoryMovementsTable } from "@workspace/db";
import {
  CreateSaleBody,
  GetSaleParams,
  ListSalesQueryParams,
  ListRecentSalesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function buildSaleResponse(saleId: number) {
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, saleId));
  if (!sale) return null;

  const items = await db
    .select()
    .from(saleItemsTable)
    .where(eq(saleItemsTable.saleId, saleId));

  return {
    ...sale,
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    total: Number(sale.total),
    items: items.map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
    })),
  };
}

async function buildSalesListResponse(rows: (typeof salesTable.$inferSelect)[]) {
  const saleIds = rows.map((s) => s.id);
  if (saleIds.length === 0) return [];

  const allItems = await db
    .select()
    .from(saleItemsTable)
    .where(sql`${saleItemsTable.saleId} = ANY(${sql.raw(`ARRAY[${saleIds.join(",")}]::int[]`)})`)

  const itemMap = new Map<number, typeof allItems>();
  for (const item of allItems) {
    if (!itemMap.has(item.saleId)) itemMap.set(item.saleId, []);
    itemMap.get(item.saleId)!.push(item);
  }

  return rows.map((sale) => ({
    ...sale,
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    total: Number(sale.total),
    items: (itemMap.get(sale.id) ?? []).map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
    })),
  }));
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${date}-${rand}`;
}

router.get("/sales/recent", async (req, res): Promise<void> => {
  const parsed = ListRecentSalesQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;

  const rows = await db
    .select()
    .from(salesTable)
    .orderBy(desc(salesTable.createdAt))
    .limit(limit);

  const result = await buildSalesListResponse(rows);
  res.json(result);
});

router.get("/sales", async (req, res): Promise<void> => {
  const parsed = ListSalesQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
  const offset = parsed.success ? (parsed.data.offset ?? 0) : 0;

  const rows = await db
    .select()
    .from(salesTable)
    .orderBy(desc(salesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const result = await buildSalesListResponse(rows);
  res.json(result);
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { customerName, paymentMethod, taxRate = 0.08, items } = parsed.data;

  // Load products and validate stock
  const productIds = items.map((i) => i.productId);
  const products = await db
    .select()
    .from(productsTable)
    .where(sql`${productsTable.id} = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]::int[]`)})`);

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Check stock for each item
  const stockRows = await db.execute(
    sql`SELECT product_id, COALESCE(SUM(CASE WHEN type = 'inbound' THEN quantity ELSE -quantity END), 0)::int AS stock
        FROM inventory_movements
        WHERE product_id = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]::int[]`)})
        GROUP BY product_id`
  );
  const stockMap = new Map<number, number>(
    (stockRows.rows as { product_id: number; stock: number }[]).map((r) => [r.product_id, r.stock])
  );

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }
    const stock = stockMap.get(item.productId) ?? 0;
    if (stock < item.quantity) {
      res.status(400).json({
        error: `Insufficient stock for "${product.name}". Available: ${stock}, requested: ${item.quantity}`,
      });
      return;
    }
  }

  // Compute totals
  let subtotal = 0;
  const lineItems = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const unitPrice = Number(product.price);
    const lineSubtotal = unitPrice * item.quantity;
    subtotal += lineSubtotal;
    return {
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: String(unitPrice),
      subtotal: String(lineSubtotal),
    };
  });
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  const invoiceNumber = generateInvoiceNumber();

  // Insert sale
  const [sale] = await db
    .insert(salesTable)
    .values({
      invoiceNumber,
      customerName: customerName ?? null,
      subtotal: String(subtotal),
      tax: String(tax),
      total: String(total),
      paymentMethod,
      status: "completed",
    })
    .returning();

  // Insert sale items
  const insertedItems = await db
    .insert(saleItemsTable)
    .values(lineItems.map((li) => ({ ...li, saleId: sale.id })))
    .returning();

  // Deduct stock: create outbound inventory movements
  await db.insert(inventoryMovementsTable).values(
    items.map((item) => ({
      productId: item.productId,
      type: "outbound" as const,
      quantity: item.quantity,
      reason: "sale",
      notes: `Invoice ${invoiceNumber}`,
    }))
  );

  const responseBody = {
    ...sale,
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    total: Number(sale.total),
    items: insertedItems.map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
    })),
  };

  const { emitInventoryUpdated, emitSaleCreated } = await import("../realtime");
  emitSaleCreated({ source: "api", sale: responseBody });
  emitInventoryUpdated({
    source: "api",
    reason: "sale",
    productIds: items.map((i) => i.productId),
    invoiceNumber,
  });

  res.status(201).json(responseBody);
});

router.get("/sales/:id", async (req, res): Promise<void> => {
  const params = GetSaleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sale = await buildSaleResponse(params.data.id);
  if (!sale) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }

  res.json(sale);
});

export default router;
