# Database setup (local development)

CodeSage needs **PostgreSQL** with the **pgvector** extension. Schema is applied automatically
when you start the API (`npm run dev -w @codesage/api`) — you only prepare the empty database
here.

---

## 1. Install PostgreSQL

Install PostgreSQL on your machine (16+; 18 works):

- Windows: [PostgreSQL download](https://www.postgresql.org/download/windows/)
- Note the **`postgres` superuser password** during install (needed for steps below).

pgAdmin is included with the Windows installer.

---

## 2. Install pgvector (native Postgres only)

The Windows PostgreSQL installer does **not** include pgvector. Install it before
`CREATE EXTENSION vector` will work.

**Windows** — build from source (Visual Studio **C++ build tools** required):

1. Open **x64 Native Tools Command Prompt for VS** as Administrator.
2. Run (replace `18` with your Postgres major version):

```cmd
set "PGROOT=C:\Program Files\PostgreSQL\18"
cd %TEMP%
git clone --branch v0.8.4 https://github.com/pgvector/pgvector.git
cd pgvector
nmake /F Makefile.win
nmake /F Makefile.win install
```

**Optional (Docker for Postgres only):** if you would rather not install Postgres + pgvector
natively, start just the database container from the repo root — the `pgvector/pgvector:pg16`
image ships with pgvector preinstalled, so you can skip [step 2](#2-install-pgvector-native-postgres-only):

```bash
docker compose up -d db
```

This runs only Postgres in Docker; the app services (`api`, `rag`, `web`) still run natively via
`npm run dev:*`. Point `DATABASE_URL` at `localhost:5432` with the Compose credentials (see the
root [`.env.example`](../.env.example) `POSTGRES_*` values).

---

## 3. Create user and database (pgAdmin)

1. Open **pgAdmin**.
2. Connect to your local server as **`postgres`**.
3. Open **Query Tool** and run:

```sql
-- Drop first if re-running (destroys existing data)
DROP DATABASE IF EXISTS codesage_db;
DROP ROLE IF EXISTS codesage_dba;

CREATE USER codesage_dba WITH
  LOGIN
  SUPERUSER
  CREATEDB
  CREATEROLE
  PASSWORD 'Test@123';

CREATE DATABASE codesage_db
  OWNER codesage_dba
  ENCODING 'UTF8'
  TEMPLATE template0;
```

> **Fix from draft:** `OWNER` must be `codesage_dba` (same as the user you create).

`SUPERUSER` is for local dev so migrations can run `CREATE EXTENSION vector`. Do not use in
production.

---

## 4. Create vector extension (pgvector)

Still in pgAdmin Query Tool, connect to the new database and run:

```sql
\c codesage_db
CREATE EXTENSION IF NOT EXISTS vector;
```

Or in pgAdmin: select database **codesage_db** → Query Tool → run only:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Verify:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

---

## 5. Update `.env`

The API and RAG services read **`DATABASE_URL` only** — see
[`apps/api/src/platform/config.ts`](../apps/api/src/platform/config.ts). They do **not** read
`POSTGRES_HOST`, `POSTGRES_PORT`, etc.

Copy [`apps/api/.env.example`](../apps/api/.env.example) → `apps/api/.env` and set:

```env
DATABASE_URL=postgresql://codesage_dba:Test%40123@localhost:5432/codesage_db
```

Use the user, password, and database from [step 3](#3-create-user-and-database-pgadmin):
`codesage_dba` / `Test@123` / `codesage_db`.

> **`@` in the password:** URL-encode it as `%40` in `DATABASE_URL` (`Test@123` → `Test%40123`).
> Without this, the connection string is parsed incorrectly.

Fill the other vars from `apps/api/.env.example` (`JWT_SECRET`, `TOKEN_ENC_KEY`, etc.).

If you run RAG locally, copy [`apps/engine/.env.example`](../apps/engine/.env.example) →
`apps/engine/.env` and set the same `DATABASE_URL`.

**Where `POSTGRES_*` comes from:** the **root** [`.env.example`](../.env.example) documents
`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` for
**Docker Compose** (`docker-compose.yml` passes them to the `db` container). They are **not**
used when you run `npm run dev -w @codesage/api` against a native Postgres install — only
`DATABASE_URL` matters there.

---

## 6. Start the app

From the repo root:

```powershell
npm run dev -w @codesage/api
```

On startup the API will:

1. Apply pending migrations in `apps/api/src/platform/migrations/`
2. Seed dev data (non-production only)
3. Listen on `http://localhost:3000/health`

---

## Troubleshooting

| Error | What to do |
|---|---|
| `extension "vector" is not available` | Install pgvector ([step 2](#2-install-pgvector-native-postgres-only)) |
| `permission denied to create extension "vector"` | Create extension as `postgres` ([step 4](#4-create-vector-extension-pgvector)) or use `SUPERUSER` on `codesage_dba` |
| `password authentication failed` | Check user/password match what you created in SQL |
| Connection string / parse errors | Encode `@` in password as `%40` in `DATABASE_URL` |

## See also

- [`docs/data-model.md`](./data-model.md)
- [`docs/schema/`](./schema/README.md)
- [`db/README.md`](../db/README.md)
