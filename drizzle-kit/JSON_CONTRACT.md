# Drizzle Kit JSON contract

This document describes the machine-readable contract for `drizzle-kit` commands that support `--json`.

It is written for tools and services that call Drizzle Kit programmatically.

## Supported commands

`--json` is supported on:

- `drizzle-kit generate --json`
- `drizzle-kit push --json`
- `drizzle-kit up --json`
- `drizzle-kit export --json`

When `--json` is enabled, callers should treat `stdout` as the JSON channel.

Each command invocation writes a single JSON object to `stdout`, optionally followed by a trailing newline.

## Why hints exist

Some schema changes are ambiguous or unsafe to apply automatically.

Typical examples:

- an entity could be a rename or a brand new entity
- an operation may drop data or fail on non-empty tables

In interactive mode, Drizzle Kit asks the user what to do.

In JSON mode, there are no prompts. Instead, callers can provide hints up front. If more guidance is still needed, Drizzle Kit returns `status: "missing_hints"` and includes the unresolved items.

## Providing hints

Hints can be passed either inline or from a file:

- `--hints '<json array>'`
- `--hints-file ./hints.json`

Both forms use the same JSON array format.

## Hint types

There are three hint categories:

- `rename`: this entity should be treated as a rename
- `create`: this entity should be treated as newly created
- `confirm_data_loss`: this potentially destructive step is approved

### Rename/create kinds

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

### Confirm kinds

Supported `kind` values for `confirm_data_loss`:

- `table`
- `column`
- `schema`
- `view`
- `primary_key`
- `add_not_null`
- `add_unique`

## How entities are described

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

## Hint payload examples

### Rename a table

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

### Declare that a new schema is truly new

```json
[
  {
    "type": "create",
    "kind": "schema",
    "entity": ["tenant_a"]
  }
]
```

### Confirm a destructive action

```json
[
  {
    "type": "confirm_data_loss",
    "kind": "table",
    "entity": ["public", "users"]
  }
]
```

## Proactive hints

Hints do not need to be provided only after receiving `missing_hints`.

Callers can provide hints proactively when they already know the intended outcome. This is useful when:

- replaying a migration workflow in CI
- applying a previously reviewed rename plan
- approving known data-loss steps in automation
- retrying the same command with stable schema transitions

## Redundant hints are safe

Callers may provide more hints than the current command run needs.

If a hint does not match an actual unresolved step in the current diff, it is ignored.

That means it is safe to:

- send a larger precomputed hint set
- reuse the same hint file across retries
- include hints for entities that are not part of the current run

## Response statuses

### `status: "ok"`

Used when the command completed successfully.

Depending on the command, this can mean:

- explain mode completed successfully
- changes were applied successfully
- snapshots were upgraded

Examples:

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

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "sqlStatements": []
}
```

```json
{ "status": "ok", "dialect": "mssql", "message": "Changes applied" }
```

For generate success and custom responses, `dialect` is always present.

### `status: "no_changes"`

Used when a command succeeds and there is nothing to do.

This includes `generate --json`, `generate --json --explain`, `push --json`, and `push --json --explain` when the diff is empty.

Current JSON-mode examples:

```json
{ "status": "no_changes", "dialect": "postgresql" }
```

```json
{ "status": "no_changes", "dialect": "postgres" }
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

When this response is emitted, the process exits with code `2`.

### `status: "aborted"`

Used only by `push --json` after `missing_hints` handling is already clear, executable statements still remain, and the caller did not allow Drizzle Kit to continue.

Current behavior:

- rename/create ambiguity and destructive non-empty entity checks return `status: "missing_hints"` first
- `status: "aborted"` is reserved for push-only warning or suggestion states that Drizzle Kit can already describe without asking for more caller input
- current resolution is to rerun the same command with `--force` if the caller approves execution
- warning-only aborted cases will move into the existing hints system in the future

Payload shape:

```json
{
  "status": "aborted",
  "dialect": "mysql",
  "warnings": [
    "You're about to change `name` column type in `users` from text to bigint"
  ]
}
```

To inspect the full warning state without executing anything, rerun the same command with `--explain --json`.

To override warnings and proceed, rerun the same command with `--force`.

### `status: "error"`

Used for structured CLI or runtime errors that are surfaced through the JSON error path.

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

### `hints`

`hints` contains human-readable warnings that are safe to show in automation or UIs.

Example:

```json
{
  "status": "ok",
  "dialect": "postgres",
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
7. If the response is `aborted`, inspect `warnings` (or rerun with `--explain --json` for the full warning state), then either stop or rerun with `--force` if the caller approves execution. In the future, these warning-only aborted cases will move into the hints system.
