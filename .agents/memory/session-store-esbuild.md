---
name: connect-pg-simple + esbuild ENOENT fix
description: Why createTableIfMissing fails in an esbuild-bundled server and how to work around it.
---

## Rule
Never use `createTableIfMissing: true` with `connect-pg-simple` in an esbuild-bundled Node server.

## Why
`connect-pg-simple` reads `table.sql` from its own package directory at runtime to create the session table. esbuild bundles everything into `dist/index.mjs` but does NOT copy non-JS assets like `table.sql`. At runtime the file is missing → `ENOENT: no such file or directory, open '.../dist/table.sql'`. The error is caught internally and logged only as a warning, so the session store silently fails to initialise — every session write is a no-op, every authenticated request returns 401.

## How to apply
Create the `user_sessions` table manually at startup using `pool.query()` with `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Call this function before seeding users. See `artifacts/api-server/src/app.ts` → `ensureSessionTable()`.
