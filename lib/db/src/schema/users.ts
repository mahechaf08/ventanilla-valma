import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"admin" | "user">().notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
