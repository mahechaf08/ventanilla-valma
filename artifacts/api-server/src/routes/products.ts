import { Router, type IRouter, type Request, type Response } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
  ListProductsQueryParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-auth";

const router: IRouter = Router();

// ── Image upload setup ────────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "products");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `prod_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getStockMap(): Promise<Map<number, number>> {
  const stockRows = await db.execute(
    sql`SELECT product_id, COALESCE(SUM(CASE WHEN type = 'inbound' THEN quantity ELSE -quantity END), 0)::int AS stock
        FROM inventory_movements GROUP BY product_id`
  );
  const map = new Map<number, number>();
  for (const row of stockRows.rows as { product_id: number; stock: number }[]) {
    map.set(row.product_id, row.stock);
  }
  return map;
}

async function getStockForProduct(productId: number): Promise<number> {
  const rows = await db.execute(
    sql`SELECT COALESCE(SUM(CASE WHEN type = 'inbound' THEN quantity ELSE -quantity END), 0)::int AS stock
        FROM inventory_movements WHERE product_id = ${productId}`
  );
  return (rows.rows[0] as { stock: number })?.stock ?? 0;
}

function buildImageUrl(req: Request, imagePath: string | null): string | null {
  if (!imagePath) return null;
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  return `${proto}://${host}/api/product-images/${imagePath}`;
}

function serializeProduct(p: typeof productsTable.$inferSelect, stockQuantity: number, req: Request) {
  return {
    ...p,
    price: Number(p.price),
    terminalPrice: p.terminalPrice != null ? Number(p.terminalPrice) : null,
    cost: p.cost != null ? Number(p.cost) : null,
    profitPercent: p.profitPercent != null ? Number(p.profitPercent) : null,
    stockQuantity,
    imagePath: buildImageUrl(req, p.imagePath),
  };
}

// ── GET /products/categories ──────────────────────────────────────────────────
router.get("/products/categories", async (req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ category: productsTable.category })
    .from(productsTable)
    .orderBy(productsTable.category);
  res.json(rows.map((r) => r.category));
});

// ── GET /products ─────────────────────────────────────────────────────────────
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

  const stockMap = await getStockMap();
  res.json(products.map((p) => serializeProduct(p, stockMap.get(p.id) ?? 0, req)));
});

// ── POST /products ────────────────────────────────────────────────────────────
router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { price, terminalPrice, cost, profitPercent, suggestedStock, ...rest } = parsed.data;

  const [product] = await db
    .insert(productsTable)
    .values({
      ...rest,
      price: String(price),
      terminalPrice: terminalPrice != null ? String(terminalPrice) : null,
      cost: cost != null ? String(cost) : null,
      profitPercent: profitPercent != null ? String(profitPercent) : null,
      suggestedStock: suggestedStock ?? 0,
      suppliers: rest.suppliers ?? "[]",
    })
    .returning();

  res.status(201).json(serializeProduct(product, 0, req));
});

// ── GET /products/:id ─────────────────────────────────────────────────────────
router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const stock = await getStockForProduct(params.data.id);
  res.json(serializeProduct(product, stock, req));
});

// ── PATCH /products/:id ───────────────────────────────────────────────────────
router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { price, terminalPrice, cost, profitPercent, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (price !== undefined) updateData.price = String(price);
  if (terminalPrice !== undefined) updateData.terminalPrice = terminalPrice != null ? String(terminalPrice) : null;
  if (cost !== undefined) updateData.cost = cost != null ? String(cost) : null;
  if (profitPercent !== undefined) updateData.profitPercent = profitPercent != null ? String(profitPercent) : null;

  const [product] = await db
    .update(productsTable)
    .set(updateData)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const stock = await getStockForProduct(params.data.id);
  res.json(serializeProduct(product, stock, req));
});

// ── POST /products/:id/image  (admin only) ────────────────────────────────────
router.post(
  "/products/:id/image",
  requireAdmin,
  upload.single("image"),
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

    if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }

    // Delete old image file if present
    const [existing] = await db
      .select({ imagePath: productsTable.imagePath })
      .from(productsTable)
      .where(eq(productsTable.id, id));

    if (existing?.imagePath) {
      fs.rm(path.join(UPLOAD_DIR, existing.imagePath), { force: true }, () => {});
    }

    const [product] = await db
      .update(productsTable)
      .set({ imagePath: req.file.filename })
      .where(eq(productsTable.id, id))
      .returning();

    if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

    const stock = await getStockForProduct(id);
    res.json(serializeProduct(product, stock, req));
  }
);

// ── DELETE /products/:id ──────────────────────────────────────────────────────
router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [product] = await db.delete(productsTable).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  // Clean up product image
  if (product.imagePath) {
    fs.rm(path.join(UPLOAD_DIR, product.imagePath), { force: true }, () => {});
  }

  res.sendStatus(204);
});

export default router;
