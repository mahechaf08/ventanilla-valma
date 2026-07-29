import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  reference: text("reference"),
  description: text("description"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  terminalPrice: numeric("terminal_price", { precision: 12, scale: 2 }),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  profitPercent: numeric("profit_percent", { precision: 6, scale: 2 }),
  category: text("category").notNull(),
  suggestedStock: integer("suggested_stock").notNull().default(0),
  imagePath: text("image_path"),
  suppliers: text("suppliers").notNull().default("[]"),
  barcode: text("barcode"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
