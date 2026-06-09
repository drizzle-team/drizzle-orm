---
name: drizzle-migrations
description: Orient to the drizzle-kit migration workflow — `defineConfig`, `generate` vs `push`, and per-dialect quirks across postgresql, mysql, sqlite, mssql, cockroach, and singlestore. Load whenever drizzle migrations are being set up or modified, `drizzle.config.ts` is being read or edited, the generate-vs-push choice is being made, or any Drizzle schema file has just been edited.
metadata:
  version: "1.0.0"
---

# Drizzle migrations

Entry-point skill for the drizzle-kit migration workflow. Three responsibilities live here: the `defineConfig` reference, the `generate` vs `push` comparison, and the per-dialect quirks catalog. Invocation details (CLI form, SDK form, response shapes) live in the operation skills.

## Configuration

`defineConfig` is the type-safe entry point. The same object shape is used by both the CLI (loaded automatically from `drizzle.config.ts`) and the SDK (passed inline to `generate` / `push`).

Required fields:

- **`dialect`** — one of `postgresql`, `mysql`, `sqlite`, `turso`, `mssql`, `cockroach`, `singlestore`. For Turso / libsql set `dialect: 'turso'` (with the `@libsql/client` or `@tursodatabase/serverless` driver) — it is a first-class dialect value, not a `sqlite` alias.
- **`schema`** — path or path-glob to the schema file(s). Examples: `'./src/db/schema.ts'`, `['./src/db/**/*.ts']`.
- **`out`** — directory where `generate` writes `.sql` migration files. Conventional: `'./drizzle'`.
- **`dbCredentials`** — per-dialect credential shape. Required for `push` (which connects to a live database) and for the introspect side of some `generate` codepaths. Either a `url` field or a structured object (`{ host, port, user, password, database }`-style); the exact shape varies by dialect. Use environment variables — never hard-code secrets.

Minimal example (postgresql):

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## Generate vs push

- **`generate`** — file-based. Computes the diff, writes a `.sql` file under `out`, and exits. The agent (or a human, or CI) reviews the SQL and applies it later via the driver's migrate runner. Safest for production. Pairs naturally with code-review workflows. Load the [drizzle-generate](../drizzle-generate/SKILL.md) skill for invocation details.
- **`push`** — direct application. Computes the diff and executes the DDL against the live database immediately. No migration file. Fastest feedback loop during development. In production, destructive changes (drop, type change, add NOT NULL with NULLs, add UNIQUE with duplicates) return `status: 'missing_hints'` and require explicit approval via the [drizzle-hints](../drizzle-hints/SKILL.md) resolution loop before they apply. Load the [drizzle-push](../drizzle-push/SKILL.md) skill for invocation details.

Choose `generate` for production releases and review workflows; choose `push` for rapid local iteration. Both operations share one JSON envelope (decoded by [drizzle-responses-and-errors](../drizzle-responses-and-errors/SKILL.md)) and one hint vocabulary.

## Dialect notes

The diff engine and dialect surface are shared by `generate` and `push`, so the per-dialect quirks below apply uniformly to both operations.

- `postgresql` — full surface: schemas, enums, sequences, views, policies, roles, privileges. `confirm_data_loss` on `view` fires only for materialized views (regular views drop silently). `serial` / `bigserial` columns auto-create their sequences with no `confirm_data_loss` prompt.
- `mysql` — `confirm_data_loss` with `reason: 'type_change'` fires on any `ALTER COLUMN` whose dialect-native type would change; `reason_details` carries `{ from, to }` with dialect-native spellings. `unsupported_schema_change/drop_pk_dependency` blocks `DROP PRIMARY KEY` when foreign keys reference the dropped columns and no covering UNIQUE exists. `unsupported_schema_change/fk_target_not_unique` blocks `CREATE FOREIGN KEY` when the referenced columns are not unique. No `schema` / `enum` / `sequence` / `policy` / `role` / `privilege` kinds.
- `sqlite` — table-rebuild semantics: most ALTERs emit `recreate_table` statements (copy-into-new-table, swap, drop-old). `confirm_data_loss/add_not_null` issues a `DELETE` to truncate nulls before the rebuild — approve only when row loss is acceptable. No `primary_key` / `add_unique` `confirm_data_loss` kinds. `turso` (libsql) shares the sqlite handler over the libsql driver.
- `mssql` — `unsupported_schema_change/rename_blocked_by_check_constraint` fires when `sp_rename` would fail because the column is referenced by a `CHECK` constraint; the agent must drop the constraint, rename, then recreate. `unsupported_schema_change/rename_schema_unsupported` is unconditional — MSSQL has no schema rename. `schema` kind is available for create / drop.
- `cockroach` — postgres-family; surface largely mirrors `postgresql`. Materialized-view drops are the only `confirm_data_loss/view` trigger. Distributed-schema notes surface in `--explain` mode.
- `singlestore` — inherits the MySQL handler shape. Same `unsupported_schema_change` variants apply (`drop_pk_dependency`, `fk_target_not_unique`). No `schema` / `enum` / `sequence` / `policy` / `role` / `privilege` kinds.
