import pg from "pg";

const sql = `
CREATE TABLE IF NOT EXISTS products (
  id serial PRIMARY KEY,
  name text NOT NULL,
  sku text NOT NULL UNIQUE,
  reference text,
  description text,
  price numeric(12, 2) NOT NULL,
  terminal_price numeric(12, 2),
  cost numeric(12, 2),
  profit_percent numeric(6, 2),
  category text NOT NULL,
  suggested_stock integer NOT NULL DEFAULT 0,
  image_path text,
  suppliers text NOT NULL DEFAULT '[]',
  barcode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id),
  type text NOT NULL,
  quantity integer NOT NULL,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id serial PRIMARY KEY,
  invoice_number text NOT NULL UNIQUE,
  customer_name text,
  subtotal numeric(10, 2) NOT NULL,
  tax numeric(10, 2) NOT NULL,
  total numeric(10, 2) NOT NULL,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id serial PRIMARY KEY,
  sale_id integer NOT NULL REFERENCES sales(id),
  product_id integer NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(10, 2) NOT NULL,
  subtotal numeric(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
  ) THEN
    ALTER TABLE user_sessions ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;
CREATE INDEX IF NOT EXISTS IDX_session_expire ON user_sessions (expire);
`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(sql);

const tables = await client.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY 1
`);
console.log("Ready tables:");
for (const row of tables.rows) console.log("-", row.table_name);
await client.end();
