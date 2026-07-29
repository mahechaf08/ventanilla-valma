import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedDefaultUsers } from "./seed-users";
import { pool } from "@workspace/db";

const app: Express = express();

// Trust Replit's reverse proxy so secure cookies and redirects work correctly
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Allow credentials from any same-site origin (Replit proxy routes everything through one domain)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Persistent PostgreSQL session store — survives server restarts
const PgSession = connectPgSimple(session);
const sessionStore = new PgSession({
  pool,
  tableName: "user_sessions",
  createTableIfMissing: true,
});

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET ?? "fallback-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      secure: false, // SSL is terminated at Replit proxy level
      maxAge: THIRTY_DAYS_MS,
      sameSite: "lax",
    },
  }),
);

// Seed default users on startup
seedDefaultUsers().catch((err) => logger.error(err, "Failed to seed users"));

// Serve uploaded product and category images as static files
const productsUploadDir = path.resolve(process.cwd(), "uploads", "products");
const categoriesUploadDir = path.resolve(process.cwd(), "uploads", "categories");
fs.mkdirSync(productsUploadDir, { recursive: true });
fs.mkdirSync(categoriesUploadDir, { recursive: true });

app.use("/api/product-images", express.static(productsUploadDir));
app.use("/api/category-images", express.static(categoriesUploadDir));

app.use("/api", router);

export default app;
