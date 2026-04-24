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

JSON mode emits newline-delimited JSON payloads.

### `status: "ok"`

Used when the command completed successfully.

Depending on the command, this can mean:

- there were no changes
- explain mode completed successfully
- changes were applied successfully
- snapshots were upgraded

Examples:

```json
{ "status": "ok", "message": "No schema changes, nothing to migrate" }
```

```json
{
  "status": "ok",
  "dialect": "postgres",
  "statements": [],
  "hints": []
}
```

```json
{
  "status": "ok",
  "dialect": "postgres",
  "statements": [
    {
      "type": "alter_column",
      "to": { "schema": "public", "table": "users", "name": "name" },
      "diff": {
        "notNull": { "from": false, "to": true }
      }
    }
  ],
  "hints": []
}
```

```json
{ "status": "ok", "dialect": "mssql", "message": "Changes applied" }
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

Examples of unresolved items:

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

Used when a command reaches a confirmation boundary that would require approval in human mode and the caller did not allow it to continue.

Example:

```json
{ "status": "aborted", "dialect": "postgres" }
```

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

`--explain` returns a dry-run result as structured JSON.

Shape:

```json
{
  "status": "ok",
  "dialect": "mysql",
  "statements": [],
  "hints": []
}
```

### `statements`

`statements` is the structured plan Drizzle Kit would execute.

The exact statement objects depend on the dialect and the diff being produced.

### `hints`

`hints` contains human-readable warnings that are safe to show in automation or UIs.

In JSON mode:

- hint text is plain text
- ANSI formatting is removed
- SQL preview text is not included inside hint objects

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

## Empty diff responses

When a command succeeds but there is nothing to do, JSON mode returns a successful structured response.

For example, `push --json --explain` and no-op JSON push flows return:

```json
{
  "status": "ok",
  "dialect": "postgres",
  "statements": [],
  "hints": []
}
```

Callers should treat an empty `statements` array as "no changes detected".

## Recommended automation flow

1. Run the command with `--json`.
2. If the response is `ok`, continue.
3. If the response is `missing_hints`, inspect `unresolved`.
4. Build the required hints.
5. Retry the same command with `--hints` or `--hints-file`.

This makes retries deterministic and keeps the workflow non-interactive.
