import { Router, type IRouter } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
  ListProductsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products/categories", async (req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ category: productsTable.category })
    .from(productsTable)
    .orderBy(productsTable.category);
  res.json(rows.map((r) => r.category));
});

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, category } = parsed.data;
  const conditions = [];

  if (search) conditions.push(ilike(productsTable.name, `%${search}%`));
  if (category) conditions.push(eq(productsTable.category, category));

  const products = await db
    .select()
    .from(productsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(productsTable.name);

  const rows = products.map((p) => {
    const stock = getStock(p.id);
    return {
      ...p,
      price: Number(p.price),
      stockQuantity: stockCache.get(p.id) ?? 0,
    };
  });

  // Fetch stock for all products
  const stockRows = await db.execute(
    sql`SELECT product_id, COALESCE(SUM(CASE WHEN type = 'inbound' THEN quantity ELSE -quantity END), 0)::int AS stock
        FROM inventory_movements GROUP BY product_id`
  );

  const stockMap = new Map<number, number>();
  for (const row of stockRows.rows as { product_id: number; stock: number }[]) {
    stockMap.set(row.product_id, row.stock);
  }

  res.json(
    products.map((p) => ({
      ...p,
      price: Number(p.price),
      stockQuantity: stockMap.get(p.id) ?? 0,
    }))
  );
});

// placeholder map (unused) — stock computed from DB
const stockCache = new Map<number, number>();
function getStock(_id: number) {
  return 0;
}

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({ ...parsed.data, price: String(parsed.data.price) })
    .returning();

  res.status(201).json({ ...product, price: Number(product.price), stockQuantity: 0 });
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const stockRows = await db.execute(
    sql`SELECT COALESCE(SUM(CASE WHEN type = 'inbound' THEN quantity ELSE -quantity END), 0)::int AS stock
        FROM inventory_movements WHERE product_id = ${params.data.id}`
  );
  const stock = (stockRows.rows[0] as { stock: number })?.stock ?? 0;

  res.json({ ...product, price: Number(product.price), stockQuantity: stock });
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined) {
    updateData.price = String(parsed.data.price);
  }

  const [product] = await db
    .update(productsTable)
    .set(updateData)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const stockRows = await db.execute(
    sql`SELECT COALESCE(SUM(CASE WHEN type = 'inbound' THEN quantity ELSE -quantity END), 0)::int AS stock
        FROM inventory_movements WHERE product_id = ${params.data.id}`
  );
  const stock = (stockRows.rows[0] as { stock: number })?.stock ?? 0;

  res.json({ ...product, price: Number(product.price), stockQuantity: stock });
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
