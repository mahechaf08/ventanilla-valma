import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, inventoryMovementsTable, productsTable } from "@workspace/db";
import {
  CreateInventoryMovementBody,
  ListInventoryMovementsQueryParams,
  ListLowStockQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/inventory", async (req, res): Promise<void> => {
  const parsed = ListInventoryMovementsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productId, type } = parsed.data;
  const conditions = [];

  if (productId !== undefined) {
    conditions.push(eq(inventoryMovementsTable.productId, productId));
  }
  if (type) {
    conditions.push(eq(inventoryMovementsTable.type, type as "inbound" | "outbound"));
  }

  const rows = await db
    .select({
      id: inventoryMovementsTable.id,
      productId: inventoryMovementsTable.productId,
      productName: productsTable.name,
      type: inventoryMovementsTable.type,
      quantity: inventoryMovementsTable.quantity,
      reason: inventoryMovementsTable.reason,
      notes: inventoryMovementsTable.notes,
      createdAt: inventoryMovementsTable.createdAt,
    })
    .from(inventoryMovementsTable)
    .innerJoin(productsTable, eq(inventoryMovementsTable.productId, productsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${inventoryMovementsTable.createdAt} DESC`);

  res.json(rows);
});

router.post("/inventory", async (req, res): Promise<void> => {
  const parsed = CreateInventoryMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const product = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, parsed.data.productId))
    .then((r) => r[0]);

  if (!product) {
    res.status(400).json({ error: "Product not found" });
    return;
  }

  if (parsed.data.type === "outbound") {
    const stockRows = await db.execute(
      sql`SELECT COALESCE(SUM(CASE WHEN type = 'inbound' THEN quantity ELSE -quantity END), 0)::int AS stock
          FROM inventory_movements WHERE product_id = ${parsed.data.productId}`
    );
    const stock = (stockRows.rows[0] as { stock: number })?.stock ?? 0;
    if (stock < parsed.data.quantity) {
      res.status(400).json({ error: `Insufficient stock. Available: ${stock}` });
      return;
    }
  }

  const [movement] = await db
    .insert(inventoryMovementsTable)
    .values(parsed.data)
    .returning();

  const payload = { ...movement, productName: product.name };
  const { emitInventoryUpdated } = await import("../realtime");
  emitInventoryUpdated({ source: "api", movement: payload });

  res.status(201).json(payload);
});

router.get("/inventory/stock", async (req, res): Promise<void> => {
  const rows = await db.execute(
    sql`SELECT p.id as "productId", p.name as "productName", p.sku, p.category,
               p.price::float as price,
               COALESCE(SUM(CASE WHEN im.type = 'inbound' THEN im.quantity ELSE -im.quantity END), 0)::int AS "stockQuantity"
        FROM products p
        LEFT JOIN inventory_movements im ON im.product_id = p.id
        GROUP BY p.id, p.name, p.sku, p.category, p.price
        ORDER BY p.name`
  );
  res.json(rows.rows);
});

router.get("/inventory/low-stock", async (req, res): Promise<void> => {
  const parsed = ListLowStockQueryParams.safeParse(req.query);
  const threshold = parsed.success ? (parsed.data.threshold ?? 5) : 5;

  const rows = await db.execute(
    sql`SELECT p.id as "productId", p.name as "productName", p.sku, p.category,
               p.price::float as price,
               COALESCE(SUM(CASE WHEN im.type = 'inbound' THEN im.quantity ELSE -im.quantity END), 0)::int AS "stockQuantity"
        FROM products p
        LEFT JOIN inventory_movements im ON im.product_id = p.id
        GROUP BY p.id, p.name, p.sku, p.category, p.price
        HAVING COALESCE(SUM(CASE WHEN im.type = 'inbound' THEN im.quantity ELSE -im.quantity END), 0) <= ${threshold}
        ORDER BY "stockQuantity" ASC`
  );
  res.json(rows.rows);
});

export default router;
