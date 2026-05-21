---
name: drizzle-hints
description: Resolve missing_hints from drizzle-kit — covers renames, drops, data loss, and the Hint reply shape for generate and push.
metadata:
  version: "1.0.0"
---

# Drizzle hints

`status: 'missing_hints'` means the diff is ambiguous (a rename could also be a drop + create) or unsafe (would drop data, would add `NOT NULL` over `NULL`s, would add `UNIQUE` over duplicates). Until hints are supplied the operation cannot proceed — the CLI exits `2`, the SDK returns the envelope without writing or applying anything.

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

15 kinds. The `kind` literal in the reply must match the literal in the unresolved item exactly. Note that `foreign key` carries a single space — it is the one remaining non-snake_case literal in the union.

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

7 kinds. Confirm-data-loss replies carry `type`, `kind`, and `entity` only — the `reason` and `reason_details` fields the request carries are runtime-only metadata and are dropped from the reply.

| kind | entity-tuple arity | dialect availability |
|---|---|---|
| `schema` | `[name]` | postgresql, cockroach, mssql |
| `table` | `[schema, name]` | all |
| `view` | `[schema, name]` | all |
| `column` | `[schema, table, name]` | all |
| `primary_key` | `[schema, table, name]` | all except sqlite / turso |
| `add_not_null` | `[schema, table, name]` | all |
| `add_unique` | `[schema, table, name]` | all except sqlite / turso |

For `add_unique`, the third slot of the entity tuple is the CONSTRAINT NAME (e.g. `'users_email_unique'`), not a column name — the runtime emits the canonical constraint identifier, and the reply must echo it verbatim. Treating it as a column name produces `error.code: 'invalid_hints'` on the retry.

## Reasons

The unresolved item for a `confirm_data_loss` carries a `reason` (and, for `type_change`, a `reason_details`). The reply does not carry the reason — it carries only `type`, `kind`, `entity`.

| reason | applicable kinds | meaning | reason_details |
|--------|------------------|---------|----------------|
| `non_empty` | `table`, `column`, `schema`, `view`, `primary_key` | Target entity has ≥1 row; drop will lose data | — |
| `nulls_present` | `add_not_null` | Target column has ≥1 `NULL`; `NOT NULL` DDL would fail | — |
| `duplicates_present` | `add_unique` | Target column(s) have ≥1 duplicate; `UNIQUE` DDL would fail | — |
| `type_change` | `column` | Existing column SQL type changes (e.g. mysql / singlestore `ALTER COLUMN`) | `{ from: string, to: string }` |

## Resolution loop

1. **Invoke.** Run `drizzle-kit generate --json` / `push --json` (CLI) or `await generate(...)` / `await push(...)` (SDK).
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
drizzle-kit push --json --config drizzle.config.ts --hints-file ./hints.json
```

`--hints` and `--hints-file` are mutually exclusive at the source level — pass one or the other, not both. A malformed JSON file or a hint that fails shape validation returns `status: 'error'` with `error.code: 'invalid_hints'` and `meta.source: 'file' | 'inline'`.

## SDK form

Pass the reply array as the `hints` option to `generate` / `push`:

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
  dbCredentials: { url: process.env.DATABASE_URL! },
  hints: [
    { type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'] },
  ],
});
```

The SDK and CLI consume the exact same `Hint` shape — anything that validates against `--hints-file` validates against `hints:` and vice versa.

## Worked example

A first invocation returns two ambiguities — one rename-or-create, one confirm-data-loss:

```json
{
  "status": "missing_hints",
  "unresolved": [
    { "type": "rename_or_create", "kind": "column",
      "entity": ["public", "users", "email_v2"] },
    { "type": "confirm_data_loss", "kind": "add_unique",
      "entity": ["public", "users", "users_handle_unique"],
      "reason": "duplicates_present" }
  ]
}
```

The reply resolves the rename-or-create as a rename of `email` → `email_v2`, and approves the unique-constraint addition:

```json
[
  { "type": "rename", "kind": "column",
    "from": ["public", "users", "email"],
    "to":   ["public", "users", "email_v2"] },
  { "type": "confirm_data_loss", "kind": "add_unique",
    "entity": ["public", "users", "users_handle_unique"] }
]
```

Re-invoke with this array via `--hints-file ./hints.json` or `hints: [...]`. The successful retry returns `status: 'ok'` (with `migration_path` for `generate`, or just `dialect` for `push`).

### Privilege 5-tuple rename

`privilege` is the only kind whose entity tuple has five slots: `[grantor, grantee, schema, table, type]`. Renaming the underlying table renames each privilege grant against it:

```json
{ "type": "rename", "kind": "privilege",
  "from": ["app_owner", "analytics_role", "public", "orders", "SELECT"],
  "to":   ["app_owner", "analytics_role", "public", "orders_v2", "SELECT"] }
```

### add_unique constraint-name confirm

For `add_unique` (`confirm_data_loss`), slot 3 of the entity tuple is the **constraint name** the runtime emits — not a column name. Echo it verbatim from the unresolved item:

```json
{ "type": "confirm_data_loss", "kind": "add_unique",
  "entity": ["public", "users", "users_email_unique"] }
```

Substituting a column name there (e.g. `"email"`) returns `error.code: 'invalid_hints'` on the retry, because the constraint identifier is the canonical entity the diff engine tracks.
