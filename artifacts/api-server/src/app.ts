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

/**
 * Create the connect-pg-simple session table manually.
 * We cannot use createTableIfMissing:true because esbuild bundles the server
 * and the table.sql file from the npm package is not copied into dist/.
 */
async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid"    varchar      NOT NULL COLLATE "default",
      "sess"   json         NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
  `);
}

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
  // createTableIfMissing is intentionally omitted — the table is created
  // manually by ensureSessionTable() because esbuild does not copy the
  // connect-pg-simple/table.sql asset into dist/, so that option throws ENOENT.
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

// Ensure session table exists, then seed default users
ensureSessionTable()
  .then(() => seedDefaultUsers())
  .catch((err) => logger.error(err, "Startup initialization failed"));

// Serve uploaded product and category images as static files
const productsUploadDir = path.resolve(process.cwd(), "uploads", "products");
const categoriesUploadDir = path.resolve(process.cwd(), "uploads", "categories");
fs.mkdirSync(productsUploadDir, { recursive: true });
fs.mkdirSync(categoriesUploadDir, { recursive: true });

app.use("/api/product-images", express.static(productsUploadDir));
app.use("/api/category-images", express.static(categoriesUploadDir));

app.use("/api", router);

export default app;
