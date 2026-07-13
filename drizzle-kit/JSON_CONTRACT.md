# Drizzle Kit JSON contract

This document describes the machine-readable contract for `drizzle-kit` commands that support `--output json`.

It is written for tools and services that call Drizzle Kit programmatically.

## Supported commands

`--output json` is supported on:

- `drizzle-kit generate --output json`
- `drizzle-kit push --output json`
- `drizzle-kit check --output json`
- `drizzle-kit pull --output json`
- `drizzle-kit up --output json`
- `drizzle-kit export --output json`

When `--output json` is set, callers should treat `stdout` as the JSON channel. Each command invocation writes a single JSON object to `stdout`.

## Programmatic API

The same JSON contract documented in this file is available as typed root-level exports of the `drizzle-kit` package for programmatic callers — agents, build tools, custom orchestrators. The CLI and SDK share one implementation; the response shapes, status discriminator, hint vocabulary, and error codes documented below apply identically to SDK return values.

```typescript
import { generate, push, check } from 'drizzle-kit';
import type { GenerateJsonResponse } from 'drizzle-kit';

const response: GenerateJsonResponse = await generate({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});

if (response.status === 'missing_hints') {
  // Resolve unresolved items and re-invoke with `hints`. See SDK.md for the full pattern.
}
```

What the SDK gives you over the CLI:

- Typed inputs (`GenerateOptions`, `PushOptions`, `CheckOptions`) — your editor narrows option names and types
- Typed responses (`GenerateJsonResponse`, `PushJsonResponse`) — the union discriminator on `status` lets TypeScript narrow into the `ok`, `no_changes`, `missing_hints`, and `error` branches
- No `--output json` flag handling, no stdout parsing — the response object is what the JSON mode would have printed

Cross-reference map:

- All `status` values — see [Response statuses](#response-statuses)
- All `kind` values inside `unresolved`, identifier shapes, and `reason` semantics — see [HINTS.md](./HINTS.md)
- All `error.code` values — see [Error codes](#error-codes)
- The `--explain` envelope (SDK callers receive the same payload when `explain: true` is passed) — see [`--explain` in JSON mode](#--explain-in-json-mode)
- The recommended retry-with-hints flow (the SDK equivalent) — see [Recommended automation flow](#recommended-automation-flow)

For a full end-to-end example including `missing_hints` handling, see [SDK.md](./SDK.md).

## Hints

The hint vocabulary — the rename-vs-create disambiguation, `confirm_data_loss` approvals, the `kind` / `reason` catalogs, and the identifier-tuple formats — is output-agnostic and documented in [HINTS.md](./HINTS.md). In JSON mode there are no prompts: callers either supply hints up front, or receive a `status: "missing_hints"` response (exit code 2) and reply with hints via `--hints` / `--hints-file`. The `missing_hints` envelope shape is documented in [`status: "missing_hints"`](#status-missing_hints) below; the `invalid_hints` error path is in [Error codes](#error-codes).

## Response statuses

### `status: "ok"`

Used when the command completed successfully.

Depending on the command, this can mean:

- explain mode completed successfully
- changes were applied successfully

Examples:

`generate --output json` success (non-explain):

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "migration_path": "drizzle/20260427153000_name/migration.sql"
}
```

`generate --output json --explain` and `push --output json --explain` success (non-empty diff):

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "statements": [],
  "hints": []
}
```

`push --output json` success (non-explain):

```json
{
  "status": "ok",
  "dialect": "postgresql"
}
```

`dialect` is always present on `status: "ok"` responses.

### `status: "no_changes"`

Used when a command succeeds and there is nothing to do.

This includes `generate --output json`, `generate --output json --explain`, `push --output json`, and `push --output json --explain` when the diff is empty.

Current JSON-mode examples:

```json
{ "status": "no_changes", "dialect": "postgresql" }
```

```json
{ "status": "no_changes", "dialect": "sqlite" }
```

### `status: "missing_hints"`

Used when JSON mode needs explicit caller guidance before it can continue. The full `MissingHint` type definition lives in [hints.ts](./src/cli/hints.ts).

Example response (one item of each `MissingHint.type`):

```json
{
  "status": "missing_hints",
  "unresolved": [
    {
      "type": "rename_or_create",
      "kind": "schema",
      "entity": ["next_schema"]
    },
    {
      "type": "confirm_data_loss",
      "kind": "table",
      "entity": ["public", "users"],
      "reason": "non_empty"
    }
  ]
}
```

When this response is emitted, the process exits with code `2`.

Under `--output text` (non-TTY) the same unresolved decisions render as a human-readable report instead — see [OUTPUT_MODES.md](./OUTPUT_MODES.md).

The available `kind` values (per `MissingHint.type`), their per-dialect applicability, the `reason` semantics for `confirm_data_loss`, and the identifier-tuple formats are catalogued in [HINTS.md](./HINTS.md#catalog-kinds-in-unresolved-items).

### `status: "error"`

Used for structured CLI or runtime errors that are surfaced through the JSON error path.

Specific error codes for hint-related impossible operations are enumerated in [Error codes](#error-codes) below; for the full list of CLI error codes, see [errors.ts](./src/cli/errors.ts).

Examples:

```json
{
  "status": "error",
  "error": {
    "code": "ambiguous_params_error",
    "command": "check",
    "configOption": "config"
  }
}
```

```json
{
  "status": "error",
  "error": {
    "code": "query_error",
    "sql": "select 1 from \"users\" limit 1",
    "params": []
  }
}
```

## Error codes

Structured error responses with `status: "error"` use a `code` field to identify the specific failure. The codes below cover hint-related and impossible-operation paths emitted in JSON mode; for the full list of CLI error codes, see [errors.ts](./src/cli/errors.ts).

| `code` | meta shape | applicable dialects | when emitted |
|--------|------------|---------------------|--------------|
| `unsupported_schema_change` | see [unsupported_schema_change variants](#unsupported_schema_change) | `mysql`, `mssql`, `singlestore` | The schema diff would emit a DDL operation that the target dialect cannot execute or rejects (per `meta.kind`) |
| `invalid_hints` | see [invalid_hints variants](#invalid_hints) | `postgresql`, `mysql`, `sqlite`, `turso`, `mssql`, `cockroach`, `singlestore` | Hints payload could not be loaded, parsed, validated, or applied — see [`invalid_hints`](#invalid_hints) below |
| `check_error` | see [`check` outcomes](#check) | `postgresql`, `mysql`, `sqlite`, `turso`, `mssql`, `cockroach`, `singlestore` | `check` found a snapshot-integrity problem (`kind: 'unsupported' \| 'malformed' \| 'non_latest'`, carries `snapshot`) or unreported branch conflicts (`kind: 'conflicts'`, carries `conflicts` + `details`) — see [`check`](#check) below |
| `database_driver_error` | `database`, `packages`, `note?` | `postgresql`, `mysql`, `sqlite`, `turso`, `mssql`, `cockroach`, `singlestore` | A command that connects to a live database (`push`, `pull`) cannot select a connection driver: the required driver package is not installed, or the installed driver is incompatible with the target (for example a local-only turso driver used against a remote turso database). This code is emitted by both connecting commands, push, pull; for `pull` it also covers the connect/introspect span and the `--init` migrate span. `database` is the dialect, `packages` lists the drivers that would satisfy the connection, and `note` carries an optional install caveat. The credential-bearing detail (the connection string, SQL, and params) is never spread into the envelope — only `database`, `packages`, and `note?` are surfaced. |

The example payloads in each variant sub-table show only the `error` object; the full response wraps them in `{"status":"error","error":{…}}`.

### `unsupported_schema_change`

`unsupported_schema_change` is emitted by several different push handlers when the schema diff would produce a DDL operation that the target dialect cannot execute or rejects. The `meta.kind` discriminator selects which of the four variants the response carries; the rest of the meta object follows the variant.

| `meta.kind` | Meta keys | Dialect(s) | When it fires |
|-------------|-----------|------------|---------------|
| `drop_pk_dependency` | `kind`, `table`, `columns`, `blocking_fks` | `mysql`, `singlestore` | `ALTER TABLE … DROP PRIMARY KEY` would be rejected because a foreign key references the dropped columns and no covering UNIQUE index exists |
| `fk_target_not_unique` | `kind`, `table`, `columns`, `table_to`, `columns_to` | `mysql`, `singlestore` | `CREATE FOREIGN KEY` would be rejected because the referenced columns are neither unique nor a primary key |
| `rename_blocked_by_check_constraint` | `kind`, `schema`, `table`, `from`, `to` | `mssql` | `sp_rename` of a column would be rejected because the column appears in a `CHECK` constraint |
| `rename_schema_unsupported` | `kind`, `from`, `to`, `dialect` | `mssql` | A `rename_schema` operation was requested — MSSQL does not support schema rename at all |

Examples:

```json
{
  "status": "error",
  "error": {
    "code": "unsupported_schema_change",
    "meta": {
      "kind": "drop_pk_dependency",
      "table": "users",
      "columns": ["id"],
      "blocking_fks": ["orders_user_id_fk"]
    }
  }
}
```

```json
{
  "status": "error",
  "error": {
    "code": "unsupported_schema_change",
    "meta": {
      "kind": "fk_target_not_unique",
      "table": "orders",
      "columns": ["user_email"],
      "table_to": "users",
      "columns_to": ["email"]
    }
  }
}
```

```json
{
  "status": "error",
  "error": {
    "code": "unsupported_schema_change",
    "meta": {
      "kind": "rename_blocked_by_check_constraint",
      "schema": "dbo",
      "table": "users",
      "from": "old_email",
      "to": "email"
    }
  }
}
```

```json
{
  "status": "error",
  "error": {
    "code": "unsupported_schema_change",
    "meta": {
      "kind": "rename_schema_unsupported",
      "from": "old_analytics",
      "to": "analytics",
      "dialect": "mssql"
    }
  }
}
```

### `invalid_hints`

`invalid_hints` is emitted by several different runtime paths. The meta shape varies by cause; discriminate by checking which keys are present.

| Cause | Meta keys | When it fires |
|-------|-----------|---------------|
| File read failure | `source: "file"`, `path` | `--hints-file` was provided but the file could not be read |
| JSON parse failure | `source: "file"` or `source: "inline"` | Hints JSON failed to parse |
| Schema validation failure | `source: "file"` or `source: "inline"`, `issues` | One or more hints failed shape validation; `issues` is an array of zod-style issue records |
| Rename `from` mismatch | `kind`, `from` | A `rename` hint's `from` tuple did not match any entity scheduled for deletion — re-running with the same hint won't change the outcome, so the caller must correct `from` |

Examples:

```json
{
  "status": "error",
  "error": {
    "code": "invalid_hints",
    "source": "file",
    "path": "hints.json"
  }
}
```

```json
{
  "status": "error",
  "error": {
    "code": "invalid_hints",
    "source": "inline",
    "issues": [{ "path": ["0", "kind"], "message": "Invalid enum value" }]
  }
}
```

```json
{
  "status": "error",
  "error": {
    "code": "invalid_hints",
    "kind": "table",
    "from": ["public", "users"]
  }
}
```

## `--explain` in JSON mode

`--explain` with `--output json` returns a dry-run result as structured JSON when the diff is non-empty.

`push` and `generate` use the same payload shape:

```json
{
  "status": "ok",
  "dialect": "mysql",
  "statements": [],
  "hints": []
}
```

When the diff is empty, `push --output json --explain` and `generate --output json --explain` return `status: "no_changes"` instead of this payload.

### `statements`

`statements` is the structured plan Drizzle Kit would execute.

The exact statement objects depend on the dialect and the diff being produced.

Object shapes:

| Dialect | `JsonStatement` definition |
|---------|----------------------------|
| PostgreSQL | [`src/dialects/postgres/statements.ts`](./src/dialects/postgres/statements.ts) |
| MySQL | [`src/dialects/mysql/statements.ts`](./src/dialects/mysql/statements.ts) |
| SQLite | [`src/dialects/sqlite/statements.ts`](./src/dialects/sqlite/statements.ts) |
| MSSQL | [`src/dialects/mssql/statements.ts`](./src/dialects/mssql/statements.ts) |
| CockroachDB | [`src/dialects/cockroach/statements.ts`](./src/dialects/cockroach/statements.ts) |
| SingleStore | inherits MySQL's `JsonStatement` shape |

### `hints`

`hints` contains human-readable warnings that are safe to show in automation or UIs.

Example:

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "statements": [],
  "hints": [
    {
      "hint": "You're about to delete non-empty users table"
    }
  ]
}
```

## `check`

`drizzle-kit check --output json` validates the migrations folder — snapshot integrity plus branch commutativity — and emits one of three envelopes. It never prompts and takes no hints. The `check()` SDK export returns the same envelopes verbatim.

### `check` success

When every snapshot is valid and the branches commute, `check` emits the `ok` envelope and exits with code `0`:

```json
{
  "status": "ok",
  "dialect": "postgresql"
}
```

`dialect` is always present, consistent with every other `status: "ok"` response.

### `check` integrity errors

When a snapshot fails integrity validation, `check` emits an `error` envelope with `code: "check_error"` and a `kind` discriminator, and exits with code `1`. The meta is flattened into `error` — `kind` and `snapshot` are siblings of `code`:

```json
{
  "status": "error",
  "error": {
    "code": "check_error",
    "kind": "unsupported",
    "snapshot": "drizzle/meta/0001_snapshot.json"
  }
}
```

`kind` is one of:

- `unsupported` — the snapshot was written by a Drizzle Kit version this binary cannot read.
- `malformed` — the snapshot could not be parsed.
- `non_latest` — the snapshot is not at the latest internal version and must be upgraded.

`snapshot` identifies the offending snapshot.

### `check` conflicts

When the branches do not commute and `--ignore-conflicts` was not passed, `check` emits an `error` envelope with `code: "check_error"`, `kind: "conflicts"`, a `conflicts` count, and a `details` array, and exits with code `1`:

```json
{
  "status": "error",
  "error": {
    "code": "check_error",
    "kind": "conflicts",
    "conflicts": 1,
    "details": [
      {
        "parentId": "0000_initial",
        "parentPath": "drizzle/0000_initial.sql",
        "branches": [
          { "leafId": "0001_a", "leafPath": "drizzle/0001_a.sql", "statementDescription": "create table a" },
          { "leafId": "0001_b", "leafPath": "drizzle/0001_b.sql", "statementDescription": "create table b" }
        ]
      }
    ]
  }
}
```

Key semantics:

- `conflicts` — the conflict count. `details.length === conflicts`.
- `details[]` — one entry per conflict.
  - `parentId` — the common parent migration id.
  - `parentPath` — the parent migration path, present only when the conflict carries one.
  - `branches` — always a two-element array (the two diverging branches). Each entry is `{ leafId, leafPath, statementDescription }`, where `leafId` / `leafPath` are the id / path of the last migration in that branch chain (`null` when a chain is empty) and `statementDescription` summarizes the branch.

### `check` exit codes

| outcome | envelope | exit code |
| --- | --- | --- |
| valid (snapshots intact, branches commute) | `{ status: "ok", dialect }` | `0` |
| integrity error (`unsupported` / `malformed` / `non_latest`) | `{ status: "error", error: { code: "check_error", kind, snapshot } }` | `1` |
| conflicts (no `--ignore-conflicts`) | `{ status: "error", error: { code: "check_error", kind: "conflicts", conflicts, details } }` | `1` |
| conflicts with `--ignore-conflicts` | `{ status: "ok", dialect }` | `0` |

## `pull`

`drizzle-kit pull --output json` introspects a live database and writes `schema.ts`, an optional `relations.ts`, and a snapshot to the configured `out` directory. The `pull()` SDK export returns the same envelope verbatim. `pull` is **ok-or-error only** — it never emits `missing_hints` (it diffs the introspected database against empty DDL, so there is no rename/data-loss consent surface) and never emits `no_changes` (a pull always writes the introspected files).

### `pull` success

On success `pull` emits a paths-manifest `ok` envelope and exits with code `0`:

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "schemaPath": "drizzle/schema.ts",
  "relationsPath": "drizzle/relations.ts",
  "snapshotPath": "drizzle/meta/0000_snapshot.json"
}
```

Keys:

- `dialect` — always present, consistent with every other `status: "ok"` response.
- `schemaPath` — the written `schema.ts`. Always present.
- `snapshotPath` — the written snapshot JSON. Always present.
- `relationsPath?` — the written `relations.ts`. **Optional**: present for `postgresql`, `mysql`, `sqlite`, `turso`, `cockroach`, and `singlestore`; omitted for `mssql` (it does not generate a relations file).
- `migrationPath?` — **Optional**: present only when `--init` ran the initial migration against the live database and wrote a migration file.

With `--init` having written an initial migration:

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "schemaPath": "drizzle/schema.ts",
  "relationsPath": "drizzle/relations.ts",
  "snapshotPath": "drizzle/meta/0000_snapshot.json",
  "migrationPath": "drizzle/0000_init/migration.sql"
}
```

On a connect, introspect, or `--init` migrate failure, `pull` emits a `status: "error"` envelope — most commonly [`database_driver_error`](#error-codes), whose meta is redacted to `{ database, packages, note? }` (the connection string / SQL / params are never spread into the envelope).

## `up`

`drizzle-kit up --output json` upgrades on-disk migration snapshots to the latest internal format, rewriting `meta/*_snapshot.json` in place. The `up()` SDK export returns the same envelope verbatim.

### `up` success

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "upgraded": ["drizzle/meta/0000_snapshot.json"]
}
```

`upgraded` is the array of rewritten snapshot paths; `[]` means every snapshot was already at the latest format (a no-op).

## `export`

`drizzle-kit export --output json` renders the full schema as a SQL dump by diffing against empty state — no database connection, nothing written. The `exportSql()` SDK export (named to avoid the reserved word `export`) returns the same envelope verbatim.

### `export` success

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "statements": ["CREATE TABLE \"users\" (\n\t\"id\" serial PRIMARY KEY NOT NULL\n);"],
  "warnings": []
}
```

Keys:

- `statements` — the individual SQL statements that recreate the schema.
- `warnings` — rendered schema-warning strings; `[]` when none.

There is no joined `sql` field on the `export` envelope; callers join `statements` themselves if a single SQL string is needed.

## Recommended automation flow

1. Run the command with `--output json`.
2. If the response is `ok`, continue.
3. If the response is `no_changes`, stop successfully.
4. If the response is `missing_hints`, inspect `unresolved`.
5. Build the required hints.
6. Retry the same command with `--hints` or `--hints-file`.

For programmatic callers, prefer hints over `--force`. The `--force` flag remains available for interactive (non-JSON) push UX where a human user is at the prompt; in `--output json` mode, all warnings must be resolved by supplying hints via `--hints` or `--hints-file`.
