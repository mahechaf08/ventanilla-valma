import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const productStatsResult = await db.execute(
    sql`SELECT COUNT(*)::int AS total_products,
               COUNT(DISTINCT category)::int AS total_categories
        FROM products`
  );

  const lowStockResult = await db.execute(
    sql`SELECT COUNT(*)::int AS low_stock_count
        FROM (
          SELECT p.id,
                 COALESCE(SUM(CASE WHEN im.type = 'inbound' THEN im.quantity ELSE -im.quantity END), 0) AS stock
          FROM products p
          LEFT JOIN inventory_movements im ON im.product_id = p.id
          GROUP BY p.id
          HAVING COALESCE(SUM(CASE WHEN im.type = 'inbound' THEN im.quantity ELSE -im.quantity END), 0) <= 5
        ) sub`
  );

  const todayStatsResult = await db.execute(
    sql`SELECT COUNT(*)::int AS today_sales_count,
               COALESCE(SUM(total), 0)::float AS today_revenue
        FROM sales
        WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE`
  );

  const allTimeStatsResult = await db.execute(
    sql`SELECT COUNT(*)::int AS all_time_sales_count,
               COALESCE(SUM(total), 0)::float AS all_time_revenue
        FROM sales
        WHERE status = 'completed'`
  );

  const ps = productStatsResult.rows[0] as { total_products: number; total_categories: number };
  const ls = lowStockResult.rows[0] as { low_stock_count: number };
  const ts = todayStatsResult.rows[0] as { today_sales_count: number; today_revenue: number };
  const at = allTimeStatsResult.rows[0] as { all_time_sales_count: number; all_time_revenue: number };

  res.json({
    totalProducts: ps?.total_products ?? 0,
    totalCategories: ps?.total_categories ?? 0,
    lowStockCount: ls?.low_stock_count ?? 0,
    todaySalesCount: ts?.today_sales_count ?? 0,
    todayRevenue: ts?.today_revenue ?? 0,
    allTimeRevenue: at?.all_time_revenue ?? 0,
    allTimeSalesCount: at?.all_time_sales_count ?? 0,
  });
});

export default router;
