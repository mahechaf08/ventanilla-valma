import { Router, type IRouter } from "express";
import { getRecentSalesBuffer } from "../realtime";

/**
 * Public HTTP mirror of the Socket.IO sales buffer so clients can
 * "Sincronizar" via the Render API without a live socket.
 */
const router: IRouter = Router();

router.get("/realtime/sales", (req, res): void => {
  const since =
    typeof req.query.since === "string" ? req.query.since : undefined;
  const entries = getRecentSalesBuffer(since);
  res.json({
    sales: entries,
    syncedAt: new Date().toISOString(),
    count: entries.length,
  });
});

export default router;
