import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin } from "../middlewares/require-auth";
import authRouter from "./auth";
import usersRouter from "./users";
import healthRouter from "./health";
import productsRouter from "./products";
import inventoryRouter from "./inventory";
import salesRouter from "./sales";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

// ── Public routes (no auth required) ─────────────────────────────────────────
router.use(authRouter);
router.use(healthRouter);

// ── Protected routes (must be authenticated) ─────────────────────────────────
router.use(requireAuth);

// Employee + admin: read products & categories, create sales (POS checkout)
router.use(productsRouter);
router.use(salesRouter);

// Admin only: inventory movements, dashboard metrics, full sales history, user mgmt
router.use(requireAdmin);
router.use(inventoryRouter);
router.use(dashboardRouter);
router.use(usersRouter);

export default router;
