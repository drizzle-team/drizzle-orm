---
name: drizzle-push
description: Apply drizzle schema changes directly to a live database without writing a migration file. Load before running `drizzle-kit push` or calling the `push(...)` SDK, when syncing a Drizzle schema directly to a live DB (prototyping, dev resets, ephemeral test databases), or when the task is to push, sync, apply, or deploy a schema.
metadata:
  version: "1.0.0"
---

# Drizzle push

If the `drizzle` skill has not been loaded yet this session, load it first — it carries the staleness check and the MCP-vs-CLI surface-selection rule that govern every drizzle-kit invocation.

The CLI flag `--output json` and the SDK `push(...)` function emit the same discriminated-union envelope, and the envelope (not the stdout text) is what the agent decodes. Output format and interactivity are separate axes: `--output json` selects the machine-readable envelope and is always non-interactive, so pass it whenever an agent calls the CLI. Under the default `--output text` the CLI prompts only when stdin is a TTY; in a non-TTY it prints the missing-decisions report and exits 2 (it never hangs prompting). See the `drizzle-output-modes` skill for the two modes and the interactivity rule. The SDK runs in JSON mode internally with no flag needed at the call site. Push is the live-DB counterpart to `generate`: `generate` is offline and writes a migration SQL file to disk, `push` connects to the database and executes the diff against it. The `drizzle-generate` skill covers the offline path; the `drizzle-migrations` skill covers the day-to-day workflow that combines them.

## CLI form

```bash
drizzle-kit push --output json [--config drizzle.config.ts] [--dialect <d>] [--schema <path>] [--explain] [--hints '<json>' | --hints-file ./hints.json]
```

Flag surface:

- `--config` — path to `drizzle.config.ts` (default: `drizzle.config.ts` at CWD). Push reads `dbCredentials` from the config; there is no CLI flag for the credentials object as a whole.
- `--dialect`, `--schema` — override the corresponding `defineConfig` fields.
- `--output json` — switches stdout to one JSON line carrying the envelope and is always non-interactive. Use it for agent / CI / scripted contexts. Under the default `--output text` the CLI prompts only on a TTY and otherwise prints the missing-decisions report (exit 2).
- `--explain` — dry-run mode. Returns planned SQL statements and computed hints instead of executing them against the database.
- `--hints` — inline JSON array of hint resolutions (see the `drizzle-hints` skill).
- `--hints-file` — same payload as `--hints`, read from a JSON file. Use for long hint sets.
- `--url` / `--host` / `--port` / `--user` / `--password` / `--database` / `--ssl` / `--auth-token` — direct connection-string overrides for the corresponding `dbCredentials` fields. Most projects set these in the config file instead.

Minimal example — `drizzle.config.ts` carries the credentials, the CLI invocation is just the verb:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

```bash
drizzle-kit push --output json --config drizzle.config.ts
# → {"status":"ok","dialect":"postgresql"}
```

The process exits with the code that matches `status` (see Response envelope below). Agents read both stdout (the envelope) and the exit code.

## SDK form

```typescript
import { push } from 'drizzle-kit';

const response = await push({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  url: process.env.DATABASE_URL!,
});

if (response.status === 'ok') {
  // schema applied to the live database
} else if (response.status === 'no_changes') {
  // live DB already matches the schema — nothing executed
} else if (response.status === 'missing_hints') {
  // response.unresolved lists ambiguities or destructive ops — see the drizzle-hints skill
} else if (response.status === 'error') {
  // response.error.code identifies the failure — see drizzle-responses-and-errors
}
```

The SDK is the public-surface entry point. It always runs in JSON mode internally — no `--output json` flag needed at the call site — and returns the same envelope the CLI prints. In SDK form the credential fields are passed flat on the call (`url`, or the broken-out `host`/`port`/`user`/`password`/`database` set) — there is no `dbCredentials` wrapper and no `drizzle.config.ts` file is required. Narrow on `response.status` to extract typed branches:

- `'ok'` → `response.dialect` (plus `response.statements`, `response.hints` in explain mode).
- `'no_changes'` → `response.dialect`.
- `'missing_hints'` → `response.unresolved` (array of items).
- `'error'` → `response.error.code` plus per-code metadata.

The SDK does not throw on user-level failures — every outcome flows through the envelope. Unexpected runtime exceptions are wrapped as `status: 'error'` with `code: 'internal_error'`.

## Response shape

Push's `'ok'` envelope is `{ status, dialect }` — no `migration_path`, since push executes the diff against the live DB rather than writing a file. `'ok'` (explain) carries `{ status, dialect, statements, hints }`. `'no_changes'`, `'missing_hints'`, and `'error'` are shared across operations. Full envelope shapes, exit-code mapping, and per-code error metadata live in the `drizzle-responses-and-errors` skill's response-envelope section.

`'missing_hints'` (exit 2) means the diff is ambiguous or unsafe — the resolution loop lives in the `drizzle-hints` skill. The most common error codes for `push` are `config_validation_error`, `config_connection_error`, `database_driver_error`, `query_error`, `unsupported_schema_change`, `invalid_hints`, `required_packages_error`, `internal_error`.

## Connection

Push requires a live database connection. In `drizzle.config.ts` (CLI form) the credentials nest under a `dbCredentials` object; in SDK form the same fields are passed flat on the `push(...)` call — no `dbCredentials` wrapper. The shape varies per dialect; common fields are `url` (preferred when the driver supports it) or the broken-out `host` / `port` / `user` / `password` / `database` set, plus `ssl` for TLS and `authToken` for turso/libsql. The per-dialect shapes below show the config (`dbCredentials`) form; in the SDK, drop the wrapper and pass these fields directly on the call.

```typescript
// postgresql / cockroach
dbCredentials: { url: process.env.DATABASE_URL! }
// or: { host, port, user, password, database, ssl }

// mysql / singlestore
dbCredentials: { url: process.env.DATABASE_URL! }
// or: { host, port, user, password, database }

// sqlite
dbCredentials: { url: 'file:./local.db' }

// turso (libsql)
dbCredentials: { url: process.env.TURSO_URL!, authToken: process.env.TURSO_AUTH_TOKEN }

// mssql
dbCredentials: { url: process.env.MSSQL_URL! }
// or: { server, port, user, password, database }
```

Secrets belong in environment variables (`process.env.DATABASE_URL`, etc.) — `drizzle.config.ts` typically ships with the repo, so hard-coded credentials leak through source control once committed. When credentials are absent or malformed, push returns `status: 'error'` with `code: 'config_connection_error'`; when the driver itself fails to connect (wrong host, bad TLS, server down), `code: 'database_driver_error'`. The `drizzle-responses-and-errors` skill decodes both.

## Destructive changes

When push would drop a non-empty table, column, schema, or view, drop a primary key, change a column's SQL type, or recreate a SQLite table to add a `NOT NULL` column (which wipes its rows), it does not execute. Instead it returns `status: 'missing_hints'` with `unresolved` items of `type: 'confirm_data_loss'`. The agent must approve each item with a matching `Hint` and re-invoke.

Adding `NOT NULL` or `UNIQUE` on the server dialects (postgresql, mysql, mssql, cockroach, singlestore) does not trigger a confirmation request — the `ALTER` runs and the database enforces the constraint, rejecting a genuine violation cleanly. Only SQLite's `add_not_null` is a `confirm_data_loss`, because SQLite has no in-place path to add the column and so recreates the table and deletes all rows (reason `table_recreate`).

The `confirm_data_loss` kinds that fire here: `table`, `column`, `schema`, `view`, `primary_key`, and (sqlite / turso only) `add_not_null`. The reasons (`non_empty`, `table_recreate`, `type_change`) and the kinds they apply to are catalogued in the `drizzle-hints` skill's reasons section. See the `drizzle-hints` skill for the full resolution loop (parse `unresolved` → build a `Hint` per item → pass `hints` back → re-invoke).

Every entity tuple leads with a namespace segment for uniform arity, but only postgresql, cockroach, and mssql have a real schema namespace (the `schema` entity kind is wired only for those three). On the schemaless dialects (mysql, sqlite, singlestore) that leading segment is a synthesized `'public'` placeholder, not a real schema — echo it verbatim; on a schemaless dialect it is filler, never build a separate `schema` rename or create from it.

## Dialect notes

Per-dialect quirks (postgresql, mysql, sqlite, mssql, cockroach, singlestore) — the same diff engine and dialect surface drives both `generate` and `push`, so the notes are shared. See the `drizzle-migrations` skill's dialect-notes section.

## Examples

```bash
# Happy path — diff applied against the live DB
drizzle-kit push --output json --config drizzle.config.ts
# → {"status":"ok","dialect":"postgresql"}

# Idempotent re-run — live DB already matches the schema
drizzle-kit push --output json --config drizzle.config.ts
# → {"status":"no_changes","dialect":"postgresql"}

# Destructive change — caller must supply confirm_data_loss hints and retry
drizzle-kit push --output json --config drizzle.config.ts
# → {"status":"missing_hints","unresolved":[{"type":"confirm_data_loss","kind":"column","entity":["public","users","legacy_id"],"reason":"non_empty"}]}
# (resolution loop: see the drizzle-hints skill)

# Hard error — wrong credential shape for the driver
drizzle-kit push --output json --config drizzle.config.ts
# → {"status":"error","error":{"code":"config_connection_error","driver":"pg","params":["url"]}}
```

SDK equivalent of the happy path:

```typescript
import { push } from 'drizzle-kit';

const r = await push({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  url: process.env.DATABASE_URL!,
});
if (r.status === 'ok') console.log('applied');
```
