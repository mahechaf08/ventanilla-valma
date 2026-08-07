import { Router, type IRouter } from "express";
import { desc, eq, gte, lte, and, sql } from "drizzle-orm";
import { db, posSalesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { bogotaDateKey } from "../lib/timezone";

const router: IRouter = Router();

/** @deprecated use bogotaDateKey from lib/timezone — re-export for callers */
export { bogotaDateKey };

function isSalePayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * GET /api/pos-sync/sales
 * Returns ALL shared POS sales from Neon (no cashier/session filter).
 * Query: limit (default 2000), offset, from, to (YYYY-MM-DD Bogota keys)
 */
router.get("/pos-sync/sales", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(
      5000,
      Math.max(1, Number(req.query.limit) || 2000),
    );
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const from =
      typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;

    const conditions = [];
    if (from) conditions.push(gte(posSalesTable.dateKey, from));
    if (to) conditions.push(lte(posSalesTable.dateKey, to));

    const rows = await db
      .select()
      .from(posSalesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(posSalesTable.createdAt))
      .limit(limit)
      .offset(offset);

    const sales = rows
      .map((row) => {
        const payload = row.payload;
        if (!isSalePayload(payload)) return null;
        return {
          ...payload,
          // Prefer durable server timestamps / invoice key
          invoiceNumber: row.invoiceNumber,
          createdAt:
            typeof payload.createdAt === "string"
              ? payload.createdAt
              : row.createdAt.toISOString(),
        };
      })
      .filter(Boolean);

    res.json({
      sales,
      count: sales.length,
      syncedAt: new Date().toISOString(),
      timezone: "America/Bogota",
    });
  } catch (err) {
    logger.error({ err }, "Failed to list pos_sales");
    res.status(500).json({ error: "No se pudieron listar las ventas" });
  }
});

/**
 * POST /api/pos-sync/sales
 * Upsert a full POS sale by invoice_number into Neon and broadcast sales_updated.
 */
router.post("/pos-sync/sales", async (req, res): Promise<void> => {
  try {
    const sale = req.body?.sale ?? req.body;
    const deviceId =
      typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined;

    if (!isSalePayload(sale) || typeof sale.invoiceNumber !== "string") {
      res.status(400).json({ error: "sale.invoiceNumber es requerido" });
      return;
    }

    const invoiceNumber = String(sale.invoiceNumber);
    const createdAtRaw =
      typeof sale.createdAt === "string" ? sale.createdAt : new Date().toISOString();
    const dateKey = bogotaDateKey(createdAtRaw);
    const total = String(sale.total ?? 0);
    const status = String(sale.status ?? "completed");
    const cashier =
      typeof sale.cashier === "string" ? sale.cashier : null;
    const cashierUserId =
      typeof sale.cashierUserId === "number" ? sale.cashierUserId : null;
    const localSaleId =
      typeof sale.id === "number" ? sale.id : null;

    const [existing] = await db
      .select({ id: posSalesTable.id })
      .from(posSalesTable)
      .where(eq(posSalesTable.invoiceNumber, invoiceNumber))
      .limit(1);

    let row;
    if (existing) {
      [row] = await db
        .update(posSalesTable)
        .set({
          payload: sale,
          localSaleId,
          cashier,
          cashierUserId,
          status,
          total,
          dateKey,
          deviceId: deviceId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(posSalesTable.invoiceNumber, invoiceNumber))
        .returning();
    } else {
      [row] = await db
        .insert(posSalesTable)
        .values({
          invoiceNumber,
          payload: sale,
          localSaleId,
          cashier,
          cashierUserId,
          status,
          total,
          dateKey,
          deviceId: deviceId ?? null,
          createdAt: new Date(createdAtRaw),
          updatedAt: new Date(),
        })
        .returning();
    }

    const { emitSalesUpdated, emitSaleCreated } = await import("../realtime");
    const payload = {
      deviceId,
      sale,
      source: "neon",
    };
    emitSaleCreated(payload);
    emitSalesUpdated({
      reason: existing ? "sale_updated" : "sale_created",
      invoiceNumber,
      deviceId,
      syncedAt: new Date().toISOString(),
    });

    res.status(existing ? 200 : 201).json({
      ok: true,
      invoiceNumber,
      id: row?.id,
      dateKey,
    });
  } catch (err) {
    logger.error({ err }, "Failed to upsert pos_sale");
    res.status(500).json({ error: "No se pudo guardar la venta" });
  }
});

/**
 * POST /api/pos-sync/sales/bulk
 * Upsert many sales (migration / catch-up from a terminal).
 */
router.post("/pos-sync/sales/bulk", async (req, res): Promise<void> => {
  try {
    const list = Array.isArray(req.body?.sales) ? req.body.sales : [];
    const deviceId =
      typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined;
    if (list.length === 0) {
      res.status(400).json({ error: "sales[] es requerido" });
      return;
    }

    let upserted = 0;
    for (const sale of list.slice(0, 2000)) {
      if (!isSalePayload(sale) || typeof sale.invoiceNumber !== "string") continue;
      const invoiceNumber = String(sale.invoiceNumber);
      const createdAtRaw =
        typeof sale.createdAt === "string"
          ? sale.createdAt
          : new Date().toISOString();
      const values = {
        invoiceNumber,
        payload: sale,
        localSaleId: typeof sale.id === "number" ? sale.id : null,
        cashier: typeof sale.cashier === "string" ? sale.cashier : null,
        cashierUserId:
          typeof sale.cashierUserId === "number" ? sale.cashierUserId : null,
        status: String(sale.status ?? "completed"),
        total: String(sale.total ?? 0),
        dateKey: bogotaDateKey(createdAtRaw),
        deviceId: deviceId ?? null,
        updatedAt: new Date(),
      };

      await db
        .insert(posSalesTable)
        .values({
          ...values,
          createdAt: new Date(createdAtRaw),
        })
        .onConflictDoUpdate({
          target: posSalesTable.invoiceNumber,
          set: {
            payload: values.payload,
            localSaleId: values.localSaleId,
            cashier: values.cashier,
            cashierUserId: values.cashierUserId,
            status: values.status,
            total: values.total,
            dateKey: values.dateKey,
            deviceId: values.deviceId,
            updatedAt: values.updatedAt,
          },
        });
      upserted += 1;
    }

    const { emitSalesUpdated } = await import("../realtime");
    emitSalesUpdated({
      reason: "bulk_upsert",
      deviceId,
      count: upserted,
      syncedAt: new Date().toISOString(),
    });

    res.json({ ok: true, upserted });
  } catch (err) {
    logger.error({ err }, "Failed bulk upsert pos_sales");
    res.status(500).json({ error: "No se pudo sincronizar el lote" });
  }
});

/** Health / count helper */
router.get("/pos-sync/sales/count", async (_req, res): Promise<void> => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(posSalesTable);
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    logger.error({ err }, "Failed count pos_sales");
    res.status(500).json({ error: "Error" });
  }
});

export default router;
