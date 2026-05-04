# Drizzle Kit JSON contract

This document describes the machine-readable contract for `drizzle-kit` commands that support `--json`.

It is written for tools and services that call Drizzle Kit programmatically.

## Supported commands

`--json` is supported on:

- `drizzle-kit generate --json`
- `drizzle-kit push --json`

When `--json` is enabled, callers should treat `stdout` as the JSON channel. Each command invocation writes a single JSON object to `stdout`.

## Response statuses

### `status: "ok"`

Used when the command completed successfully.

Depending on the command, this can mean:

- explain mode completed successfully
- changes were applied successfully

Examples:

`generate --json` success (non-explain):

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "migration_path": "drizzle/20260427153000_name/migration.sql"
}
```

`generate --json --explain` and `push --json --explain` success (non-empty diff):

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "statements": [],
  "hints": []
}
```

`push --json` success (non-explain):

```json
{
  "status": "ok",
  "dialect": "postgresql"
}
```

`dialect` is always present on `status: "ok"` responses.

### `status: "no_changes"`

Used when a command succeeds and there is nothing to do.

This includes `generate --json`, `generate --json --explain`, `push --json`, and `push --json --explain` when the diff is empty.

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

#### Catalog: kinds in unresolved items

`MissingHint.type: "rename_or_create"` may carry any of: `schema`, `role`, `table`, `enum`, `sequence`, `view`, `column`, `default`, `policy`, `check`, `index`, `unique`, `primary key`, `foreign key`, `privilege`.

`MissingHint.type: "confirm_data_loss"` may carry any of: `schema`, `table`, `view`, `column`, `primary_key`, `not_null_constraint`, `unique_constraint`.

See [Identifier formats](#identifier-formats) for the identifier tuple shape and an example for each kind.

#### Catalog: reasons (`confirm_data_loss` only)

`MissingHint` items of `type: "confirm_data_loss"` carry a `reason` field naming why approval is needed. `type_change` additionally carries a `reason_details: { from, to }` field.

| `reason` | Applies to `kind` | When it fires | Approval authorizes | Extra meta |
|----------|-------------------|---------------|---------------------|------------|
| `non_empty` | `table`, `view`, `column`, `schema`, `primary_key` | Runtime detects at least one row in the affected entity | Data loss on the existing rows | — |
| `nulls_present` | `not_null_constraint` | Target column has at least one `NULL` at probe time | Runtime to attempt the DDL; it will fail unless the caller backfills first | — |
| `duplicates_present` | `unique_constraint` | Target columns have at least one duplicate value at probe time | Runtime to attempt the DDL; it will fail unless the caller deduplicates first | — |
| `type_change` | `column` (MySQL / SingleStore only) | An existing column's SQL type would change via `alter_column` | Runtime to perform the type change | `reason_details: { from, to }` (source and target SQL types) |

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

## Hint types

Some schema changes are ambiguous (rename vs. create+delete) or unsafe to apply automatically (drops on non-empty data, NOT NULL on nullable columns, etc.). In interactive mode, Drizzle Kit prompts the user. In JSON mode there are no prompts: callers either supply hints up front, or receive a `status: "missing_hints"` response and reply with hints.

A caller's `Hint` resolves a runtime-emitted `MissingHint` by reusing its `kind` and `entity` (and, for `rename_or_create`, choosing a `rename` vs `create` resolution).

| Unresolved item (`MissingHint`) | Caller responds with (`Hint`) | What's reused |
|---------------------------------|------------------------------|---------------|
| `{ type: "rename_or_create", kind, entity }` | `{ type: "rename", kind, from, to }` **or** `{ type: "create", kind, entity }` | Same `kind`. For `create`: same `entity`. For `rename`: pick `from` from a deleted entity (same `kind`); the unresolved item's `entity` becomes `to`. |
| `{ type: "confirm_data_loss", kind, entity, reason, [reason_details] }` | `{ type: "confirm_data_loss", kind, entity }` | Same `kind` and `entity`. `reason` and `reason_details` are runtime-only metadata — callers do not include them. |

Available `kind` values, identifier shapes, and `reason` semantics are catalogued under [`status: "missing_hints"`](#status-missing_hints).

### Providing hints

Hints can be passed either inline or from a file:

- `--hints '<json array>'`
- `--hints-file ./hints.json`

Both forms use the same JSON array format.

### `rename` / `create`

`rename` tells Drizzle Kit a change is one logical entity moving from `from` to `to`. `create` tells Drizzle Kit `entity` is newly created — if the diff also contains a removed entity of the same `kind`, the outcome stays create+delete instead of being interpreted as a rename.

Available `kind` values, identifier shapes, and which `MissingHint.type` each can resolve are listed under [`status: "missing_hints"` → Catalog: kinds](#catalog-kinds-in-unresolved-items).

#### Rename a table

```json
[
  {
    "type": "rename",
    "kind": "table",
    "from": ["public", "orders_old"],
    "to": ["public", "orders"]
  }
]
```

#### Rename a column

Treat `display_name` as the same column previously named `full_name`:

```json
[
  {
    "type": "rename",
    "kind": "column",
    "from": ["public", "users", "full_name"],
    "to": ["public", "users", "display_name"]
  }
]
```

#### Create + delete instead of rename

Treat `display_name` as a truly new column. If `full_name` is also removed in the same diff, this means Drizzle Kit should create the new column and keep the old column as a separate delete instead of interpreting the change as a rename:

```json
[
  {
    "type": "create",
    "kind": "column",
    "entity": ["public", "users", "display_name"]
  }
]
```

#### Declare that a new schema is truly new

```json
[
  {
    "type": "create",
    "kind": "schema",
    "entity": ["tenant_a"]
  }
]
```

### `confirm_data_loss`

Approves a potentially destructive step — dropping a non-empty entity, adding a `NOT NULL` constraint to a column that currently contains nulls, adding a `UNIQUE` constraint to columns with duplicates, or changing an existing column's SQL type.

Available `kind` values and the `reason` each can fire under are catalogued under [`status: "missing_hints"`](#status-missing_hints) (see [Catalog: kinds](#catalog-kinds-in-unresolved-items) and [Catalog: reasons](#catalog-reasons-confirm_data_loss-only)).

#### Confirm a destructive action

```json
[
  {
    "type": "confirm_data_loss",
    "kind": "table",
    "entity": ["public", "users"]
  }
]
```

#### `column`

`type_change` is the only `reason` that carries `reason_details`. Example `MissingHint` payload (as emitted in `unresolved`):

```json
{
  "type": "confirm_data_loss",
  "kind": "column",
  "entity": ["public", "users", "name"],
  "reason": "type_change",
  "reason_details": { "from": "varchar(100)", "to": "varchar(50)" }
}
```

Formal hint shapes are declared via the [`Hint` type](./src/cli/hints.ts).

### Proactive hints

Hints do not need to be provided only after receiving `missing_hints`.

Callers can provide hints proactively when they already know the intended outcome. This is useful when:

- replaying a migration workflow in CI
- applying a previously reviewed rename plan
- approving known data-loss steps in automation
- retrying the same command with stable schema transitions

For example, when a caller knows ahead of time that a table is being renamed (`users` → `members`):

```json
[
  {
    "type": "rename",
    "kind": "table",
    "from": ["public", "users"],
    "to": ["public", "members"]
  }
]
```

Or that a column is being renamed (`full_name` → `display_name`):

```json
[
  {
    "type": "rename",
    "kind": "column",
    "from": ["public", "users", "full_name"],
    "to": ["public", "users", "display_name"]
  }
]
```

### Redundant hints are safe

Callers may provide more hints than the current command run needs.

If a hint does not match an actual unresolved step in the current diff, it is ignored.

That means it is safe to:

- send a larger precomputed hint set
- reuse the same hint file across retries
- include hints for entities that are not part of the current run

## Error codes

Structured error responses with `status: "error"` use a `code` field to identify the specific failure. The codes below cover hint-related and impossible-operation paths emitted in JSON mode; for the full list of CLI error codes, see [errors.ts](./src/cli/errors.ts).

| `code` | Dialect(s) | When it fires | Example payload |
|--------|------------|---------------|-----------------|
| `drop_pk_dependency` | MySQL | `ALTER TABLE … DROP PRIMARY KEY` would be rejected because a foreign key references the dropped columns and no covering UNIQUE index exists | `{"code":"drop_pk_dependency","table":"users","columns":["id"],"blocking_fks":["orders_user_id_fk"]}` |
| `fk_target_not_unique` | MySQL | `CREATE FOREIGN KEY` would be rejected because the referenced columns are neither unique nor a primary key | `{"code":"fk_target_not_unique","table":"orders","columns":["user_email"],"table_to":"users","columns_to":["email"]}` |
| `rename_blocked_by_check_constraint` | MSSQL | `sp_rename` of a column would be rejected because the column appears in a `CHECK` constraint | `{"code":"rename_blocked_by_check_constraint","schema":"dbo","table":"users","from":"old_email","to":"email"}` |
| `rename_schema_unsupported` | MSSQL | A `rename_schema` operation was requested — MSSQL does not support schema rename at all | `{"code":"rename_schema_unsupported","from":"old_analytics","to":"analytics","dialect":"mssql"}` |
| `invalid_hints` | (any) | Hints payload could not be loaded, parsed, validated, or applied — see [`invalid_hints`](#invalid_hints) below | (variant — see below) |

The example payloads above show only the `error` object; the full response wraps them in `{"status":"error","error":{…}}`.

### `invalid_hints`

`invalid_hints` is emitted by several different runtime paths. The meta shape varies by cause; discriminate by checking which keys are present.

| Cause | Meta keys | When it fires |
|-------|-----------|---------------|
| File read failure | `source: "file"`, `path` | `--hints-file` was provided but the file could not be read |
| JSON parse failure | `source: "file"` or `source: "inline"` | Hints JSON failed to parse |
| Schema validation failure | `source: "file"` or `source: "inline"`, `issues` | One or more hints failed shape validation; `issues` is an array of zod-style issue records |
| Rename `from` mismatch | `kind`, `from` | A `rename` hint's `from` tuple did not match any entity scheduled for deletion — re-running with the same hint won't change the outcome, so the caller must correct `from` |

Examples (one per variant, in table order):

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

## Identifier formats

Each hint identifies an entity using an `entity`, `from`, or `to` tuple. The arity depends on the entity kind.

| Arity | Format | Used by `kind` | Example |
|-------|--------|----------------|---------|
| 1 | `[name]` | `schema`, `role` | `["tenant_a"]` |
| 2 | `[schema, name]` | `table`, `enum`, `sequence`, `view` | `["public", "users"]` |
| 3 | `[schema, table, name]` | `column`, `default`, `policy`, `check`, `index`, `unique`, `primary key`, `foreign key`, `primary_key`¹, `not_null_constraint`¹, `unique_constraint`¹ ² | `["public", "users", "email"]` |
| 5 | `[grantor, grantee, schema, table, type]` | `privilege` | `["postgres", "app_user", "public", "users", "select"]` |

¹ `confirm_data_loss` only.

² For `unique_constraint` (`confirm_data_loss`), the third slot is the **constraint name** (e.g. `users_email_unique`), not a column name. This disambiguates composite unique constraints that share a leading column.

## `--explain` in JSON mode

`--explain --json` returns a dry-run result as structured JSON when the diff is non-empty.

`push` and `generate` use the same payload shape:

```json
{
  "status": "ok",
  "dialect": "mysql",
  "statements": [],
  "hints": []
}
```

When the diff is empty, `push --json --explain` and `generate --json --explain` return `status: "no_changes"` instead of this payload.

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

## Recommended automation flow

1. Run the command with `--json`.
2. If the response is `ok`, continue.
3. If the response is `no_changes`, stop successfully.
4. If the response is `missing_hints`, inspect `unresolved`.
5. Build the required hints.
6. Retry the same command with `--hints` or `--hints-file`.

For programmatic callers, prefer hints over `--force`. The `--force` flag remains available for interactive (non-`--json`) push UX where a human user is at the prompt; in `--json` mode, all warnings must be resolved by supplying hints via `--hints` or `--hints-file`.
