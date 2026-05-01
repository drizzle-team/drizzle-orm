# Drizzle Kit JSON contract

This document describes the machine-readable contract for `drizzle-kit` commands that support `--json`.

It is written for tools and services that call Drizzle Kit programmatically.

## Supported commands

`--json` is supported on:

- `drizzle-kit generate --json`
- `drizzle-kit push --json`

When `--json` is enabled, callers should treat `stdout` as the JSON channel.

Each command invocation writes a single JSON object to `stdout`, optionally followed by a trailing newline.

## Vocabulary lock notice

**Vocabulary locked.** This document defines the v1-stable contract for `--json` mode. The set of hint types (`rename`, `create`, `confirm_data_loss`), confirm kinds (`table`, `column`, `schema`, `view`, `primary_key`, `add_not_null`, `add_unique`), confirm reasons (`non_empty`, `nulls_present`, `duplicates_present`, `type_change`), response statuses (`ok`, `no_changes`, `missing_hints`, `error`), and structured error codes documented below is locked as the v1 surface. Future changes are additive and follow Drizzle Kit's versioning policy.

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

```json
{
  "status": "ok",
  "dialect": "sqlite",
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
{ "status": "no_changes", "dialect": "postgresql" }
```

### `status: "missing_hints"`

Used when JSON mode needs explicit caller guidance before it can continue.

Shape:

```json
{
  "status": "missing_hints",
  "unresolved": []
}
```

Missing hint shapes:

- [type `MissingHint`](./src/cli/hints.ts)

Example with inline unresolved items:

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

Individual unresolved item shapes:

```json
{
  "type": "rename_or_create",
  "kind": "table",
  "entity": ["public", "orders"]
}
```

```json
{
  "type": "confirm_data_loss",
  "kind": "table",
  "entity": ["public", "users"],
  "reason": "non_empty"
}
```

Current `reason` values:

- `non_empty`
- `nulls_present`
- `duplicates_present`

The `type_change` reason is also defined for `confirm_data_loss / column`; see [§Hint types → `confirm_data_loss` → `column`](#column) below for its `reason_details` shape.

When this response is emitted, the process exits with code `2`.

### `status: "error"`

Used for structured CLI or runtime errors that are surfaced through the JSON error path.

Specific error codes for hint-related impossible operations are enumerated in [§Error codes](#error-codes) below; for the full list of CLI error codes, see [errors.ts](./src/cli/errors.ts).

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

Some schema changes are ambiguous or unsafe to apply automatically.

Typical examples:

- an entity could be a rename, or it could be a brand new entity while the old one is deleted
- an operation may drop data or fail on non-empty tables

Specifically, when one entity disappears and another entity of the same kind appears, Drizzle Kit cannot always tell whether the intended outcome is:

- one entity being renamed
- one entity being deleted while a different entity is created

In interactive mode, Drizzle Kit asks the user what to do via prompts.

In JSON mode, there are no prompts. Instead, callers can provide hints explaining the actual intent behind ambiguous changes. If necessary hints weren't provided, Drizzle Kit returns `status: "missing_hints"` and includes the unresolved items.

`rename` and `create` hints resolve this rename-vs-create+delete ambiguity:

- `rename` means the `from` and `to` identifiers refer to the same logical entity
- `create` means the new entity is truly new, so any removed predecessor stays a separate delete

### Providing hints

Hints can be passed either inline or from a file:

- `--hints '<json array>'`
- `--hints-file ./hints.json`

Both forms use the same JSON array format.

### `rename` / `create`

Provide a resolution whether a change should be treated as a rename or a create+delete, resolving the ambiguity.
`rename` tells Drizzle Kit to treat a change as one logical entity moving from `from` to `to`.
`create` tells Drizzle Kit to treat `entity` as newly created. When the diff also contains a removed entity of the same kind, this confirms the outcome is create+delete rather than a rename.

Supported `kind` values for `rename` and `create`:

- `schema`
- `role`
- `table`
- `default`
- `enum`
- `sequence`
- `view`
- `column`
- `policy`
- `privilege`
- `check`
- `index`
- `unique`
- `primary key`
- `foreign key`

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

Approves a potentially destructive step, such as dropping a non-empty table or adding a `NOT NULL` constraint to a column that currently contains nulls.

Supported `kind` values for `confirm_data_loss`:

- `table`
- `column`
- `schema`
- `view`
- `primary_key`
- `add_not_null`
- `add_unique`

Supported `reason` values (emitted on `MissingHint`; **not** accepted on caller-supplied `Hint` payloads — `confirmHintSchema` is `.strict()` and rejects extra keys):

- `non_empty`
- `nulls_present`
- `duplicates_present`
- `type_change`

Caller-supplied `confirm_data_loss` hints are entity-only (`{ type, kind, entity }`); the `reason` is informational metadata that the runtime emits to explain *why* a `MissingHint` was raised.

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

When MySQL or SingleStore would change an existing column's SQL type via `alter_column`, the operation requires confirmation via `confirm_data_loss / column / type_change`. The runtime-emitted `MissingHint` includes a `reason_details` field with the source and target type strings; the caller-supplied `Hint` stays entity-only (the entity tuple identifies which column to approve). The `type_change` reason currently fires only on MySQL and SingleStore for the `column` kind.

Caller-supplied `Hint` payload:

```json
{
  "type": "confirm_data_loss",
  "kind": "column",
  "entity": ["public", "users", "name"]
}
```

Runtime-emitted `MissingHint` payload (in `unresolved`):

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

### Redundant hints are safe

Callers may provide more hints than the current command run needs.

If a hint does not match an actual unresolved step in the current diff, it is ignored.

That means it is safe to:

- send a larger precomputed hint set
- reuse the same hint file across retries
- include hints for entities that are not part of the current run

## Error codes

Structured error responses with `status: "error"` use a `code` field to identify the specific failure. The four codes below are emitted on hint-related impossible operations — the caller cannot resolve them by supplying a hint, the schema must change.

### `drop_pk_dependency`

Fires when MySQL would reject `ALTER TABLE ... DROP PRIMARY KEY` because a foreign key references the dropped columns and no covering UNIQUE index exists.

```json
{
  "status": "error",
  "error": {
    "code": "drop_pk_dependency",
    "table": "users",
    "columns": ["id"],
    "blocking_fks": ["orders_user_id_fk"]
  }
}
```

### `fk_target_not_unique`

Fires when MySQL would reject `CREATE FOREIGN KEY` because the referenced columns are neither unique nor a primary key.

```json
{
  "status": "error",
  "error": {
    "code": "fk_target_not_unique",
    "table": "orders",
    "columns": ["user_email"],
    "table_to": "users",
    "columns_to": ["email"]
  }
}
```

### `rename_blocked_by_check_constraint`

Fires when MSSQL would reject `sp_rename` of a column because the column appears in a CHECK constraint.

```json
{
  "status": "error",
  "error": {
    "code": "rename_blocked_by_check_constraint",
    "schema": "dbo",
    "table": "users",
    "from": "old_email",
    "to": "email"
  }
}
```

### `rename_schema_unsupported`

Fires when the requested operation is `rename_schema` on MSSQL — MSSQL does not support schema rename at all.

```json
{
  "status": "error",
  "error": {
    "code": "rename_schema_unsupported",
    "from": "old_analytics",
    "to": "analytics",
    "dialect": "mssql"
  }
}
```

For the full list of CLI error codes, see [errors.ts](./src/cli/errors.ts).

## Identifier formats

Each hint identifies an entity using an `entity`, `from`, or `to` tuple.

The tuple shape depends on the entity kind.

### One-part identifiers

Used by:

- `schema`
- `role`

Format:

```json
["name"]
```

Example:

```json
["tenant_a"]
```

### Two-part identifiers

Used by:

- `table`
- `enum`
- `sequence`
- `view`

Format:

```json
["schema", "name"]
```

Example:

```json
["public", "users"]
```

### Three-part identifiers

Used by:

- `column`
- `default`
- `policy`
- `check`
- `index`
- `unique`
- `primary key`
- `foreign key`

Format:

```json
["schema", "table", "name"]
```

Examples:

```json
["public", "users", "email"]
```

```json
["dbo", "users", "users_pkey"]
```

### Five-part identifiers

Used by:

- `privilege`

Format:

```json
["grantor", "grantee", "schema", "table", "type"]
```

Example:

```json
["postgres", "app_user", "public", "users", "select"]
```

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

- [type `JsonStatement` for PostgreSQL](./src/dialects/postgres/statements.ts)
- [type `JsonStatement` for MySQL](./src/dialects/mysql/statements.ts)
- [type `JsonStatement` for SQLite](./src/dialects/sqlite/statements.ts)
- [type `JsonStatement` for MSSQL](./src/dialects/mssql/statements.ts)
- [type `JsonStatement` for CockroachDB](./src/dialects/cockroach/statements.ts)

SingleStore inherits MySQL's `JsonStatement` shape.

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
