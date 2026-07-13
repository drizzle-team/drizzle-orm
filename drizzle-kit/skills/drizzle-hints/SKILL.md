---
name: drizzle-hints
description: Resolve `missing_hints` responses from drizzle-kit `generate` or `push` — covers rename-vs-create disambiguation, `confirm_data_loss` approvals, and the `Hint` reply array shape for the retry. Load whenever drizzle-kit output shows `missing_hints` status, prompts to confirm a rename or destructive change, or the next step is constructing a `hints` array for a retry call.
metadata:
  version: "1.0.0"
---

# Drizzle hints

If the `drizzle` skill has not been loaded yet this session, load it first — it carries the staleness check and the MCP-vs-CLI surface-selection rule that govern every drizzle-kit invocation.

`status: 'missing_hints'` means the diff is ambiguous (a rename could also be a drop + create) or unsafe (would drop a non-empty entity, or would recreate a SQLite table and wipe its rows). Until hints are supplied the operation cannot proceed — the CLI exits `2`, the SDK returns the envelope without writing or applying anything.

Under `--output text` + non-TTY the same unresolved decisions surface as the human-readable missing-decisions report on stdout (also exit code 2) rather than this envelope — the `drizzle-output-modes` skill covers the text-report shape.

Resolution is one round trip: read each item in `unresolved`, build one reply `Hint` per item, re-invoke the same command with the array. Both the missing-hints request shape and the reply shape are typed and validated by the runtime — wrong arity, wrong spelling, or wrong reply discriminator returns `status: 'error'` with `error.code: 'invalid_hints'`. See the `drizzle-responses-and-errors` skill for that branch.

## Reply types

A reply is an array of `Hint`. Each `Hint` is one of these three shapes:

```typescript
{ type: 'rename', kind: K, from: <entity-tuple>, to: <entity-tuple> }   // resolves a rename_or_create AS a rename
{ type: 'create', kind: K, entity: <entity-tuple> }                     // resolves a rename_or_create AS a create
{ type: 'confirm_data_loss', kind: K, entity: <entity-tuple> }          // approves a destructive change
```

The `confirm_data_loss` reply omits the `reason` and `reason_details` keys that the request carries — those are runtime-only metadata used to explain why the prompt fired. The reply only needs `type`, `kind`, and `entity`.

Each unresolved item maps to exactly one reply:

| unresolved item type | reply type |
|----------------------|------------|
| `'rename_or_create'` | `'rename'` (pick a deleted entity of the same kind to be the `from`) OR `'create'` |
| `'confirm_data_loss'` | `'confirm_data_loss'` (same `kind` + `entity`) |

## Rename-vs-create kinds

The `kind` literal in the reply must match the literal in the unresolved item exactly. Note that `foreign key` carries a single space — it is the one remaining non-snake_case literal in the union.

| kind | entity-tuple arity | dialect availability |
|---|---|---|
| `schema` | `[name]` | postgresql, cockroach, mssql |
| `role` | `[name]` | postgresql, cockroach |
| `table` | `[schema, name]` | all |
| `enum` | `[schema, name]` | postgresql, cockroach |
| `sequence` | `[schema, name]` | postgresql, cockroach |
| `view` | `[schema, name]` | all |
| `column` | `[schema, table, name]` | all |
| `default` | `[schema, table, name]` | all |
| `policy` | `[schema, table, name]` | postgresql, cockroach |
| `check` | `[schema, table, name]` | all |
| `index` | `[schema, table, name]` | all |
| `unique` | `[schema, table, name]` | all |
| `primary_key` | `[schema, table, name]` | all |
| `foreign key` | `[schema, table, name]` | all |
| `privilege` | `[grantor, grantee, schema, table, type]` | postgresql, cockroach |

The runtime only emits unresolved items for kinds that exist on the target dialect, so the dialect-availability column is informational — an agent that just echoes whatever shows up in `unresolved` never sees a kind that doesn't apply. For `rename`, both `from` and `to` are entity tuples of the same arity (the `from` is a deleted entity of the same kind that the new one is being matched against). For `create`, only `entity` is set.

## Confirm-data-loss kinds

Confirm-data-loss replies carry `type`, `kind`, and `entity` only — the `reason` and `reason_details` fields the request carries are runtime-only metadata and are dropped from the reply.

| kind | entity-tuple arity | dialect availability |
|---|---|---|
| `schema` | `[name]` | postgresql, cockroach, mssql |
| `table` | `[schema, name]` | all |
| `view` | `[schema, name]` | postgresql, cockroach (materialized views only) |
| `column` | `[schema, table, name]` | all |
| `primary_key` | `[schema, table, name]` | all except sqlite / turso |
| `add_not_null` | `[schema, table, name]` | sqlite / turso only |

`add_not_null` is the only confirmation-triggering constraint addition, and it fires only on sqlite / turso. The server dialects (postgresql, mysql, mssql, cockroach, singlestore) add `NOT NULL` / `UNIQUE` constraints without triggering a confirmation request — the `ALTER` runs and the database enforces the constraint, rejecting a genuine violation cleanly — so neither `add_not_null` nor `add_unique` surfaces as a `confirm_data_loss` on those dialects.

## Reasons

The unresolved item for a `confirm_data_loss` carries a `reason` (and, for `type_change`, a `reason_details`). The reply does not carry the reason — it carries only `type`, `kind`, `entity`.

| reason | applicable kinds | meaning | reason_details |
|--------|------------------|---------|----------------|
| `non_empty` | `table`, `column`, `schema`, `view`, `primary_key` | Target entity has ≥1 row; drop will lose data | — |
| `table_recreate` | `add_not_null` (sqlite / turso only) | Adding the `NOT NULL` column has no in-place path on SQLite, so confirming wipes all rows and recreates the table | — |
| `type_change` | `column` | Existing column SQL type changes (e.g. mysql / singlestore `ALTER COLUMN`) | `{ from: string, to: string }` |

## Resolution loop

1. **Invoke.** Run `drizzle-kit generate --output json` / `push --output json` (CLI) or `await generate(...)` / `await push(...)` (SDK).
2. **Read the envelope.** If `status === 'missing_hints'`, the response carries `unresolved: MissingHint[]`. Each item has a `type` of `'rename_or_create'` or `'confirm_data_loss'`.
3. **Build the reply.** For every `unresolved[i]`, append exactly one `Hint` to the reply array:
   - `rename_or_create` → pick `rename` (provide `from` as a deleted entity of the same `kind`) OR `create` (just echo `entity`).
   - `confirm_data_loss` → echo the same `kind` and `entity`; drop `reason` and `reason_details`.
4. **Re-invoke** the same command, passing the reply array via the CLI flag or the SDK option (see below). Repeat from step 2 if more hints surface.

The reply must cover every item in `unresolved` — partial replies that still leave ambiguities return `missing_hints` again with the still-unresolved items.

## CLI form

Pass the reply array as JSON via one of two flags on `generate` or `push`:

- `--hints '<json>'` — inline JSON array of `Hint` objects. Watch shell quoting; the JSON has to survive your shell intact.
- `--hints-file ./hints.json` — same JSON array read from a file. Preferred for arrays of more than one or two items.

```bash
drizzle-kit push --output json --config drizzle.config.ts --hints-file ./hints.json
```

`--hints` and `--hints-file` are mutually exclusive at the source level — pass one or the other, not both. A malformed JSON file or a hint that fails shape validation returns `status: 'error'` with `error.code: 'invalid_hints'` and `meta.source: 'file' | 'inline'`.

## SDK form

Pass the reply array as a raw `Hint[]` via the `hints` option to `generate` / `push` (or use `hintsFile` with a file path instead):

```typescript
import { generate, push } from 'drizzle-kit';

const r1 = await generate({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  hints: [
    { type: 'rename', kind: 'column', from: ['public', 'users', 'email'], to: ['public', 'users', 'email_v2'] },
  ],
});

const r2 = await push({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  url: process.env.DATABASE_URL!,
  hints: [
    { type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'] },
  ],
});
```

The SDK and CLI consume the exact same `Hint` shape — anything that validates against `--hints-file` validates against `hints:` and vice versa.

## Worked example

A first invocation against a SQLite database returns two ambiguities — one rename-or-create, one confirm-data-loss:

```json
{
  "status": "missing_hints",
  "unresolved": [
    { "type": "rename_or_create", "kind": "column",
      "entity": ["public", "users", "email_v2"] },
    { "type": "confirm_data_loss", "kind": "add_not_null",
      "entity": ["public", "users", "handle"],
      "reason": "table_recreate" }
  ]
}
```

The `table_recreate` reason fires because SQLite has no in-place way to add a `NOT NULL` column — confirming it recreates the `users` table and wipes its rows. The reply resolves the rename-or-create as a rename of `email` → `email_v2`, and approves the `NOT NULL` addition:

```json
[
  { "type": "rename", "kind": "column",
    "from": ["public", "users", "email"],
    "to":   ["public", "users", "email_v2"] },
  { "type": "confirm_data_loss", "kind": "add_not_null",
    "entity": ["public", "users", "handle"] }
]
```

Re-invoke with this array via `--hints-file ./hints.json` (CLI) or `hints: [...]` (SDK). The successful retry returns `status: 'ok'` (with `migration_path` for `generate`, or just `dialect` for `push`).

### Privilege 5-tuple rename

`privilege` is the only kind whose entity tuple has five slots: `[grantor, grantee, schema, table, type]`. Renaming the underlying table renames each privilege grant against it:

```json
{ "type": "rename", "kind": "privilege",
  "from": ["app_owner", "analytics_role", "public", "orders", "SELECT"],
  "to":   ["app_owner", "analytics_role", "public", "orders_v2", "SELECT"] }
```

## Schema-namespace placeholder

Every entity tuple leads with a namespace segment so its arity is uniform across dialects, but only postgresql, cockroach, and mssql have a real schema namespace — the `schema` entity kind is wired for those three dialects only. On the schemaless dialects (mysql, sqlite, singlestore) that leading segment is a synthesized `'public'` placeholder, not a real schema. Echo whatever the unresolved item carries in that slot verbatim; on a schemaless dialect it is filler — never build a separate `schema` rename or create from it.
