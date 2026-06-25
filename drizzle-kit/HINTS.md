# Drizzle Kit hints

This document describes the output-agnostic hint vocabulary shared by `drizzle-kit generate` and `push`: the rename-vs-create disambiguation, `confirm_data_loss` approvals, the `kind` / `reason` catalogs, and the identifier-tuple formats. The same vocabulary applies whether decisions surface as a JSON `missing_hints` envelope (see [JSON_CONTRACT.md](./JSON_CONTRACT.md)) or as the text report (see [OUTPUT_MODES.md](./OUTPUT_MODES.md)).

## Hints flow

Some schema changes are ambiguous (rename vs. create+delete) or unsafe to apply automatically (drops on non-empty data, recreating a SQLite table to add a `NOT NULL` column, etc.). In interactive mode, Drizzle Kit prompts the user. When non-interactive there are no prompts: callers either supply hints up front, or receive the unresolved decisions and reply with hints.

For example, renaming a column in the schema:

```diff
 export const users = pgTable('users', {
   id: serial('id').primaryKey(),
-  full_name: text('full_name'),
+  display_name: text('display_name'),
 });
```

From the diff alone, Drizzle Kit cannot tell whether `display_name` is the renamed `full_name` or an unrelated new column whose addition coincides with `full_name`'s removal — hence a `rename_or_create` unresolved item:

```sh
$ drizzle-kit push --output json
{
  "status": "missing_hints",
  "unresolved": [
    {
      "type": "rename_or_create",
      "kind": "column",
      "entity": ["public", "users", "display_name"]
    }
  ]
}

$ drizzle-kit push --output json --hints '[{"type":"rename","kind":"column","from":["public","users","full_name"],"to":["public","users","display_name"]}]'
{ "status": "ok", "dialect": "postgresql" }
```

A caller's `Hint` resolves a runtime-emitted `MissingHint` by reusing its `kind` and `entity` (and, for `rename_or_create`, choosing a `rename` vs `create` resolution).

| Unresolved item (`MissingHint`) | Caller responds with (`Hint`) | What's reused |
|---------------------------------|------------------------------|---------------|
| `{ type: "rename_or_create", kind, entity }` | `{ type: "rename", kind, from, to }` **or** `{ type: "create", kind, entity }` | Same `kind`. For `create`: same `entity`. For `rename`: pick `from` from a deleted entity (same `kind`); the unresolved item's `entity` becomes `to`. |
| `{ type: "confirm_data_loss", kind, entity, reason, [reason_details] }` | `{ type: "confirm_data_loss", kind, entity }` | Same `kind` and `entity`. `reason` and `reason_details` are runtime-only metadata — callers do not include them. |

Available `kind` values, identifier shapes, and `reason` semantics are catalogued in [Catalog: kinds](#catalog-kinds-in-unresolved-items), [Catalog: reasons](#catalog-reasons-confirm_data_loss-only), and [Identifier formats](#identifier-formats).

## Providing hints

Hints can be passed either inline or from a file:

- `--hints '<json array>'`
- `--hints-file ./hints.json`

Both forms use the same JSON array format.

## `rename` / `create`

`rename` tells Drizzle Kit a change is one logical entity moving from `from` to `to`. `create` tells Drizzle Kit `entity` is newly created — if the diff also contains a removed entity of the same `kind`, the outcome stays create+delete instead of being interpreted as a rename.

Available `kind` values, identifier shapes, and which `MissingHint.type` each can resolve are listed under [Catalog: kinds](#catalog-kinds-in-unresolved-items).

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

### Rename a column

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

### Create + delete instead of rename

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

## `confirm_data_loss`

Approves a potentially destructive step — dropping a non-empty entity, recreating a SQLite table to add a `NOT NULL` column (which wipes its rows), or changing an existing column's SQL type. Adding `NOT NULL` / `UNIQUE` on the server dialects (postgresql, mysql, mssql, cockroach, singlestore) does not trigger a confirmation request: the `ALTER` runs and the database enforces the constraint, rejecting a genuine violation cleanly.

Available `kind` values and the `reason` each can fire under are catalogued in [Catalog: kinds](#catalog-kinds-in-unresolved-items) and [Catalog: reasons](#catalog-reasons-confirm_data_loss-only).

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

### `column`

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

## Proactive hints

Hints do not need to be provided only after receiving an unresolved decision.

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

## Redundant hints are safe

Callers may provide more hints than the current command run needs.

If a hint does not match an actual unresolved step in the current diff, it is ignored.

That means it is safe to:

- send a larger precomputed hint set
- reuse the same hint file across retries
- include hints for entities that are not part of the current run

## Catalog: kinds in unresolved items

Tuple shape per `kind` is listed in [Identifier formats](#identifier-formats); these tables enumerate the kind set and per-dialect applicability only.

Unmarked kinds apply to all dialects (`postgresql`, `mysql`, `sqlite`, `turso`, `mssql`, `cockroach`, `singlestore`); footnotes call out dialect-restricted ones.

`MissingHint.type: "rename_or_create"` carries one of these `kind` values:

- `table`
- `column`
- `default`
- `view`
- `check`
- `index`
- `unique`
- `primary_key`
- `foreign key`
- `schema`¹
- `enum`²
- `sequence`²
- `policy`²
- `role`²
- `privilege`²

¹ `postgresql`, `mssql`, `cockroach` only.

² `postgresql`, `cockroach` only.

`MissingHint.type: "confirm_data_loss"` carries one of these `kind` values:

- `table`
- `column`
- `add_not_null`¹
- `schema`²
- `view`³
- `primary_key`⁴

¹ `sqlite`, `turso` only. The server dialects (`postgresql`, `mysql`, `mssql`, `cockroach`, `singlestore`) add `NOT NULL` / `UNIQUE` without triggering a confirmation request — the `ALTER` runs and the database enforces the constraint, rejecting a genuine violation cleanly — so neither `add_not_null` nor `add_unique` surfaces as a `confirm_data_loss` on those dialects.

² `postgresql`, `mssql`, `cockroach` only.

³ `postgresql`, `cockroach` only — materialized-view drops only; regular-view drops do not emit `confirm_data_loss`.

⁴ `postgresql`, `mysql`, `mssql`, `cockroach`, `singlestore` only (no `sqlite`/`turso`).

## Catalog: reasons (`confirm_data_loss` only)

`MissingHint` items of `type: "confirm_data_loss"` carry a `reason` field naming why approval is needed.

| `reason` | applicable `kind`s | explanation | `reason_details` |
|----------|--------------------|-------------|------------------|
| `non_empty` | `table`, `column`, `schema`, `view`, `primary_key` | Runtime probed the target entity and found at least one row of existing data. Approval authorizes the DDL to proceed and acknowledges that existing rows will be lost. | — |
| `table_recreate` | `add_not_null` (`sqlite` / `turso` only) | SQLite has no in-place path to add a `NOT NULL` column, so confirming wipes all rows and recreates the table. Approval acknowledges that the table is recreated and its existing rows are lost. | — |
| `type_change` | `column` | An existing column's SQL type would change via `alter_column` on MySQL or SingleStore. Approval authorizes the type change. `from`/`to` carry dialect-native column-type spellings (e.g. `varchar(100)`, `int`, `decimal(10,4)`) sourced from the underlying `JsonStatement`. | `{ from: string, to: string }` |

## Identifier formats

Each hint identifies an entity using an `entity`, `from`, or `to` tuple. The arity depends on the entity kind.

| Format | Used by `kind` | Example |
|--------|----------------|---------|
| `[name]` | `schema`, `role` | `["tenant_a"]` |
| `[schema, name]` | `table`, `enum`, `sequence`, `view` | `["public", "users"]` |
| `[schema, table, name]` | `column`, `default`, `policy`, `check`, `index`, `unique`, `primary_key`, `foreign key`, `add_not_null`¹ | `["public", "users", "email"]` |
| `[grantor, grantee, schema, table, type]` | `privilege` | `["postgres", "app_user", "public", "users", "select"]` |

¹ `confirm_data_loss` only (`sqlite` / `turso`).

The leading namespace segment keeps tuple arity uniform across dialects, but only postgresql, cockroach, and mssql have a real schema namespace — the `schema` entity kind is wired only for those three. On the schemaless dialects (mysql, sqlite, singlestore) that leading segment is a synthesized `'public'` placeholder, not a real schema. Echo it verbatim; on a schemaless dialect it is filler, never build a separate `schema` rename or create from it.
