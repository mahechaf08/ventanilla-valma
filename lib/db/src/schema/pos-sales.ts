import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Shared POS sales ledger for multi-device sync.
 * Stores the full localStorage Sale JSON so product IDs need not match Neon catalog FKs.
 */
export const posSalesTable = pgTable(
  "pos_sales",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    /** Full POS Sale object (items, payments, cashier, etc.) */
    payload: jsonb("payload").notNull(),
    /** Local POS sale id (may collide across devices; invoice_number is canonical) */
    localSaleId: integer("local_sale_id"),
    cashier: text("cashier"),
    cashierUserId: integer("cashier_user_id"),
    status: text("status").notNull().default("completed"),
    total: text("total").notNull().default("0"),
    /** Calendar day in America/Bogota (YYYY-MM-DD) for shift reports */
    dateKey: text("date_key").notNull(),
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pos_sales_date_key_idx").on(table.dateKey),
    index("pos_sales_created_at_idx").on(table.createdAt),
  ],
);

export const insertPosSaleSchema = createInsertSchema(posSalesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPosSale = z.infer<typeof insertPosSaleSchema>;
export type PosSale = typeof posSalesTable.$inferSelect;
