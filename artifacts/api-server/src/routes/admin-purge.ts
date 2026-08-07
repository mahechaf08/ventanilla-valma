import { eq, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import {
  db,
  posSalesTable,
  salesTable,
  saleItemsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CONFIRMATION_WORD = "BORRAR";

export type PurgeScope = "sales" | "cash" | "full";

async function requireAdminCredentials(
  username: unknown,
  password: unknown,
): Promise<{ ok: true; username: string } | { ok: false; status: number; error: string }> {
  if (typeof username !== "string" || !username.trim()) {
    return { ok: false, status: 400, error: "Usuario administrador requerido" };
  }
  if (typeof password !== "string" || !password) {
    return { ok: false, status: 400, error: "Contraseña requerida" };
  }

  const identifier = username.trim();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(eq(usersTable.username, identifier), eq(usersTable.email, identifier)),
    )
    .limit(1);

  if (!user) {
    return { ok: false, status: 401, error: "Credenciales inválidas" };
  }
  if (user.role !== "admin") {
    return { ok: false, status: 403, error: "Solo administradores pueden ejecutar esta acción" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { ok: false, status: 401, error: "Credenciales inválidas" };
  }

  return { ok: true, username: user.username };
}

async function wipePosSalesLedger(): Promise<number> {
  const deleted = await db.delete(posSalesTable).returning({ id: posSalesTable.id });
  return deleted.length;
}

async function wipeClassicSalesTables(): Promise<void> {
  // sale_items first (FK), then sales
  await db.delete(saleItemsTable);
  await db.delete(salesTable);
}

/**
 * POST /api/admin/purge
 * Admin-only durable wipe of transactional sales data in Neon.
 * Body: { scope, confirmation, username, password }
 */
router.post("/admin/purge", async (req, res): Promise<void> => {
  try {
    const confirmation = String(req.body?.confirmation ?? "").trim().toUpperCase();
    if (confirmation !== CONFIRMATION_WORD) {
      res.status(400).json({
        error: `Debes escribir ${CONFIRMATION_WORD} para confirmar`,
      });
      return;
    }

    const auth = await requireAdminCredentials(req.body?.username, req.body?.password);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const scope = String(req.body?.scope ?? "") as PurgeScope;
    if (scope !== "sales" && scope !== "cash" && scope !== "full") {
      res.status(400).json({ error: "Alcance inválido" });
      return;
    }

    let posSalesDeleted = 0;
    let classicSalesWiped = false;

    // Cash-only does not touch Neon sales ledger (cash closes live in localStorage).
    if (scope === "sales" || scope === "full") {
      posSalesDeleted = await wipePosSalesLedger();
      await wipeClassicSalesTables();
      classicSalesWiped = true;
    }

    const { emitSalesUpdated, emitDataPurged } = await import("../realtime");
    emitDataPurged({
      scope,
      by: auth.username,
      syncedAt: new Date().toISOString(),
    });
    if (scope === "sales" || scope === "full") {
      emitSalesUpdated({
        reason: "admin_purge",
        scope,
        syncedAt: new Date().toISOString(),
      });
    }

    logger.warn(
      { scope, by: auth.username, posSalesDeleted, classicSalesWiped },
      "Admin transactional purge executed",
    );

    res.json({
      ok: true,
      scope,
      posSalesDeleted,
      classicSalesWiped,
    });
  } catch (err) {
    logger.error({ err }, "Admin purge failed");
    res.status(500).json({ error: "No se pudo completar la limpieza" });
  }
});

/** Lightweight admin probe — does not mutate data */
router.post("/admin/verify", async (req, res): Promise<void> => {
  try {
    const auth = await requireAdminCredentials(req.body?.username, req.body?.password);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    res.json({ ok: true, username: auth.username });
  } catch (err) {
    logger.error({ err }, "Admin verify failed");
    res.status(500).json({ error: "Error de verificación" });
  }
});

export default router;
