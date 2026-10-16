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

### Schema states in `drizzle-kit/api-postgres`

`drizzle-kit/api-postgres` exports helpers for tools that store the state of a postgres schema themselves. They return a schema state: the full state of a schema, with an id and parents.

```typescript
type SchemaState = {
  version: '9';
  dialect: 'postgres';
  id: string;
  prevIds: string[];
  ddl: Entity[];
};
```

A schema state is not a snapshot. It has no `type` field, and a migrations folder never holds one. It is plain JSON, so a tool can save it with `JSON.stringify` and pass the parsed file back later. `Entity` is described in [Postgres snapshot format 9](#postgres-snapshot-format-9).

- `generateDrizzleJson(imports, prevId?, schemaFilters?)` returns the state of the schema in `imports`. `prevId` becomes the only entry of `prevIds`. Without `prevId`, or with an empty string, `prevIds` holds only the origin id `00000000-0000-0000-0000-000000000000`.
- `generateMigration(prev, cur)` returns the SQL statements that turn `prev` into `cur`, as an array of strings. Each argument is a schema state, or a full state in format 5, 6, 7 or 8, which it converts in memory. It reads only the rows of each state. It ignores `id`, `prevIds` and `type`, so the two states do not have to name each other. It throws on a diff snapshot, because a diff snapshot holds only the changes of one migration.
- `up(state)` converts one full state of an older format to a schema state and returns `{ snapshot, hints }`. It needs no other file of the history. To convert a migrations folder, run `drizzle-kit up`.
- `reconstruct(files, id?)` reconstructs a state from the snapshot files of a folder. `files` maps each migration folder name to the parsed JSON of its `snapshot.json`. It returns the schema state of snapshot `id`. Without `id`, it returns the state of the only leaf, and it throws when the folder has several leaves. For an old format or a broken history, it throws the same errors as the CLI.

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

When `generate --fix-conflicts` (postgresql only) deletes migrations, the `ok` or `no_changes` envelope also has `deleted_migrations`: the migration folders that the fix deleted. `no_changes` then means that the remaining migrations already matched the schema, so the fix wrote no new migration. If some of them were custom migrations, `deleted_custom_migrations` lists those folders too. If the folder has no conflict, the fix deletes nothing, and the envelope has no `deleted_migrations`. With `--explain`, the fix deletes nothing. If the folder has conflicts, the envelope has `fix` in place of `deleted_migrations`. See [`--explain` in JSON mode](#--explain-in-json-mode) and [`check` conflicts](#check-conflicts).

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

After `generate --fix-conflicts`, a `no_changes` envelope can also have `deleted_migrations` and `deleted_custom_migrations`. The fix then deleted those folders, and the remaining migrations already matched the schema. After `generate --fix-conflicts --explain`, it can have `fix`, the folders that the fix would delete.

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
| `unsupported_command_dialect_error` | `command`, `dialect?`, `option?`, `conflictsWith?` | all | The command, or one of its options, cannot run with this dialect or with another option. `option` names the rejected option. `conflictsWith` names the other option when the two cannot be used together, as `generate` does for `--explain` with `--custom`. |
| `check_error` | see [`check` outcomes](#check) | `postgresql`, `mysql`, `sqlite`, `turso`, `mssql`, `cockroach`, `singlestore` | A command that reads the migrations folder found a snapshot-integrity problem (`kind: 'unsupported' \| 'malformed' \| 'non_latest' \| 'order'`, carries `snapshot`, and for a broken postgres history also `parentId`, `parentSnapshot` or `baseSnapshot`) or unreported branch conflicts (`kind: 'conflicts'`, carries `conflicts` + `details`). See [`check`](#check) below. |
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

`generate --fix-conflicts --explain` (postgresql only) deletes nothing. The statements are the ones that the new migration would hold after the fix. If the folder has conflicts, the `ok` payload and the `no_changes` envelope also have `fix`, with the same shape as `fix` in the [`check` conflicts](#check-conflicts) error: `migrations` lists the folders that the fix would delete, and `customMigrations` lists the custom migrations among them. If the folder has no conflict, the result has no `fix`.

`generate` rejects `--explain` together with `--custom`, because a custom migration has no SQL to explain. The error has `code: "unsupported_command_dialect_error"` and the meta `{ command: "generate", option: "explain", conflictsWith: "custom" }`, and `generate` writes nothing.

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

## Migrations folder and snapshot files

`generate` writes each migration into its own folder under `out`:

```text
drizzle/
  20260101120001_init/
    migration.sql
    snapshot.json
  20260101120002_email/
    migration.sql
    snapshot.json
```

The folder name is the UTC time in the form `YYYYMMDDHHMMSS`, an underscore, and the migration name. The drizzle-orm migrator reads only `migration.sql`, and it runs the folders in folder-name order. drizzle-kit reads `snapshot.json` to compute the next migration and to check branches.

Every snapshot has an `id` and a `prevIds` array. `prevIds` lists the ids of the snapshot's parents. The first snapshot in the migrations folder has one parent, the origin id `00000000-0000-0000-0000-000000000000`. A snapshot with more than one parent is a merge snapshot. A leaf is a snapshot that no other snapshot lists as a parent. The migrations folder has several leaves after git branches that each added migrations come together.

Older drizzle-kit versions wrote `meta/_journal.json` and `meta/<n>_snapshot.json`, and each snapshot had a single `prevId`. `generate`, `check` and `migrate` stop on such a folder with `migrations_outdated_error`, and they stop on a snapshot of an older format with `check_error` kind `non_latest`. `drizzle-kit up` converts both. See [`up`](#up).

### Folder order

Each folder name must sort after the names of all its parents, because migrate runs the SQL in folder-name order. `generate` names a new folder after the current time. For postgresql, if the clock is behind the newest parent, `generate` uses the time of that parent plus one second. The other dialects always name the folder from the local clock. In a postgres folder, a folder that sorts before one of its parents stops every command with `check_error` kind `order`. See [`check` integrity errors](#check-integrity-errors).

### Snapshot formats per dialect

Only postgres uses snapshot format 9. The other dialects store the full schema state in every snapshot.

| dialect | `version` | content |
| --- | --- | --- |
| `postgresql` | `"9"` | base and diff snapshots, described below |
| `mysql` | `"6"` | full state |
| `sqlite`, `turso` | `"7"` | full state |
| `mssql` | `"2"` | full state |
| `singlestore` | `"2"` | full state |
| `cockroach` | `"1"` | full state |

A full-state snapshot has the shape `{ version, dialect, id, prevIds, ddl, renames }`. `ddl` holds every entity of the schema after the migration. `renames` lists the renames of that migration as `"<old name>-><new name>"` strings.

### Postgres snapshot format 9

```typescript
type Entity = { entityType: string; [field: string]: unknown };

type BaseSnapshot = {
  type: 'base';
  version: '9';
  dialect: 'postgres';
  id: string;
  prevIds: ['00000000-0000-0000-0000-000000000000'];
  statements: Statement[];
  ddl: Entity[];
};

type DiffSnapshot = {
  type: 'diff';
  version: '9';
  dialect: 'postgres';
  id: string;
  prevIds: string[]; // at least one parent
  statements: Statement[];
  deltas: Delta[];
};

type Statement = { type: string; [field: string]: unknown };

type Delta =
  | { op: 'create'; row: Entity }
  | { op: 'drop'; key: string }
  | { op: 'alter'; key: string; set: Partial<Entity> }
  | { op: 'rename'; key: string; set: Partial<Entity> };
```

- A **base snapshot** holds the full state. It is the first snapshot in the migrations folder. `generate` writes it for the first migration, and `pull` writes it into an empty migrations folder.
- A **diff snapshot** holds only the deltas of its own migration. `generate` writes one for every later migration. `generate --custom` writes one with `deltas: []` and `statements: []`.

A snapshot with another `type` is malformed. A base snapshot that lists a parent is malformed too.

Format 9 snapshots have no `renames` field. `generate` on an unchanged schema writes no folder.

Every snapshot stores the **statements** of its own migration in `statements`, in the order of the SQL in `migration.sql`. A statement is one schema change with its meaning, for example a column rename or a new index. `type` names its kind, such as `create_table`, `add_column` or `rename_column`. The other fields hold the data of that change, so the statements say what the SQL does without a rebuild of the history.

A stored statement holds the data that its SQL statement needs, and nothing else. So drizzle-kit can rebuild the SQL of a migration from the statements of its snapshot. Every kind has a fixed shape, which [`src/dialects/postgres/snapshot-statements.ts`](./src/dialects/postgres/snapshot-statements.ts) defines. `statements` is required. A snapshot is malformed if it has no `statements`, or if one of its statements has an unknown `type`, a missing field or an unknown field.

- A base snapshot stores the create statements of its state. This applies to the first `generate`, to `pull` and to `up`.
- A diff snapshot stores the statements of its migration. A merge snapshot stores only the statements of its own change.
- The snapshot of a custom migration stores an empty list, so drizzle-kit does not see SQL that was written by hand.
- `up` computes the statements of every snapshot that it converts.

`check` compares the stored statements of the snapshots of two branches. It takes its conflicts only from them, so its result for an old migration does not change with a newer drizzle-kit.

drizzle-kit reconstructs the state of a snapshot with the installed version.

Each item of `ddl`, and each `row` of a `create`, is one entity of the schema. `entityType` names its kind. For example, a column:

```json
{
  "schema": "public",
  "table": "users",
  "name": "email",
  "type": "varchar",
  "typeSchema": null,
  "notNull": false,
  "dimensions": 0,
  "default": null,
  "generated": null,
  "identity": null,
  "entityType": "columns"
}
```

A key names one entity. It is the entity type, a NUL character, and the identity fields of the entity as a JSON array. In a JSON file the NUL character is written as `\u0000`, so the key of the column above is `"columns\u0000[\"public\",\"users\",\"email\"]"`.

| entity type | identity fields |
| --- | --- |
| `schemas`, `roles` | `name` |
| `tables`, `enums`, `sequences`, `views`, `indexes` | `schema`, `name` |
| `columns`, `fks`, `pks`, `uniques`, `checks`, `policies` | `schema`, `table`, `name` |
| `privileges` | `schema`, `table`, `grantor`, `grantee`, `type` |

The key of an index does not hold its table, because postgres keeps index names unique in a schema. So a table rename changes the `table` field of the indexes of that table and leaves their keys unchanged.

A **delta** changes the one entity that its key names:

| `op` | effect on the state |
| --- | --- |
| `create` | adds the entity in `row` |
| `drop` | removes the entity at `key`, and no other entity |
| `alter` | assigns the fields in `set` to the entity at `key` |
| `rename` | assigns `set` and stores the entity under its new key; the user decided this rename or move. It also writes the new name into the entities that reference the renamed entity |

A rename changes other entities too, for example the columns of a renamed table, or the column list of a key after a column rename. These entities get no delta of their own. When drizzle-kit reconstructs a state, it applies a rename through the edges: the rules that say which fields of one entity type hold the key of another entity. It writes the new name into every entity that references the renamed entity and that the state holds at that moment. So the rename of one branch also reaches the entities that another branch added.

A snapshot that holds a delta with another `op` is malformed.

To reconstruct the state of a snapshot, drizzle-kit follows the first parents back to the base snapshot. From there it applies the deltas of every snapshot on that path of first parents, in order. The deltas of a merge snapshot on the path start from its combined state.

The combined state of a merge snapshot is built in three steps:

1. Reconstruct the state of the first parent.
2. Take the snapshots in the merge's history that are missing from the first parent's history.
3. Apply their deltas in folder-name order.

One set of rules covers a delta that does not fit the state. The rules are the same in a merge and outside a merge:

- A `drop`, an `alter` or a `rename` of a missing entity is skipped. A skipped rename changes no other entity.
- A `create` onto a taken key does nothing when the entity at that key has equal values in all fields. When a field differs, the command stops with an error.
- A `rename` that moves an entity onto a key that another entity holds stops the command with an error that names both keys. The same holds when the rename moves a referencing entity onto a taken key.

A skip occurs in a merge that `generate` writes. Some changes store a delta and no statement, for example a jsonb default whose keys are written in another order. `check` compares statements, so it finds no conflict between such a change on one branch and a rename of the table on the other branch. If the rename is applied first, the delta names an entity that is missing under the old key, and it is skipped. The diff for the merge snapshot then finds the change again, and the merge snapshot stores it. A skip also occurs in a merge that `drizzle-kit up` converted from format 8.

When the combined state already equals the schema, `generate` returns `no_changes` and writes no merge migration, so every migration that is not custom contains SQL.

`generate` lists every leaf in the `prevIds` of a merge snapshot, and the leaf with the newest folder name comes first. The merge's `migration.sql` holds only the new change, because the other branches' SQL already runs from their own folders.

Example: a base, a column add, a column rename with a `NOT NULL` change, and a merge after two branches. The long rows are cut to `…`.

```jsonc
// 20260101120001_init/snapshot.json
{
  "type": "base",
  "version": "9",
  "dialect": "postgres",
  "id": "d3339e19-89f8-4fe9-a7ee-bee3db901d0d",
  "prevIds": ["00000000-0000-0000-0000-000000000000"],
  "statements": [
    { "type": "create_table", "table": { "schema": "public", "name": "users", "columns": [ … ], … } }
  ],
  "ddl": [
    { "schema": "public", "name": "users", "isRlsEnabled": false, "entityType": "tables" },
    { "schema": "public", "table": "users", "name": "id", "type": "integer", …, "entityType": "columns" }
  ]
}

// 20260101120002_email/snapshot.json
{
  "type": "diff",
  "version": "9",
  "dialect": "postgres",
  "id": "2b39a1e8-3f89-4842-916d-6998b0ac6304",
  "prevIds": ["d3339e19-89f8-4fe9-a7ee-bee3db901d0d"],
  "statements": [
    { "type": "add_column", "column": { "schema": "public", "table": "users", "name": "email", "type": "varchar", … }, … }
  ],
  "deltas": [
    { "op": "create", "row": { "schema": "public", "table": "users", "name": "email", "type": "varchar", …, "entityType": "columns" } }
  ]
}

// 20260101120003_rename/snapshot.json
{
  "type": "diff",
  "version": "9",
  "dialect": "postgres",
  "id": "d4eab725-04f4-4581-bc0a-8982608fa2b3",
  "prevIds": ["2b39a1e8-3f89-4842-916d-6998b0ac6304"],
  "statements": [
    { "type": "rename_column", "from": { "table": "users", "name": "email", … }, "to": { "table": "users", "name": "mail", … } },
    { "type": "alter_column", "to": { "table": "users", "name": "mail", "notNull": true, … }, … }
  ],
  "deltas": [
    { "op": "rename", "key": "columns\u0000[\"public\",\"users\",\"email\"]", "set": { "name": "mail" } },
    { "op": "alter", "key": "columns\u0000[\"public\",\"users\",\"mail\"]", "set": { "notNull": true } }
  ]
}

// 20260101120006_age/snapshot.json, after the branch folders 20260101120004_likes and 20260101120005_posts
{
  "type": "diff",
  "version": "9",
  "dialect": "postgres",
  "id": "31c40787-97df-4bc4-b064-bf418893d2f3",
  "prevIds": ["75e723a1-d6f4-4516-9340-82f9696797fc", "71a65ad8-0ae7-48e8-9fff-ad4343d8a315"],
  "statements": [
    { "type": "add_column", "column": { "schema": "public", "table": "users", "name": "age", "type": "integer", … }, … }
  ],
  "deltas": [
    { "op": "create", "row": { "schema": "public", "table": "users", "name": "age", "type": "integer", …, "entityType": "columns" } }
  ]
}
```

Format 8, the postgres format before format 9, stored the full state in every snapshot: `{ version: "8", dialect: "postgres", id, prevIds, ddl, renames }`.

## `check`

`drizzle-kit check --output json` validates the migrations folder — snapshot integrity plus conflicts between branches — and emits one of three envelopes. For postgresql, it also compares the schema with the migrations and reports a difference as a warning in the `ok` envelope. It never prompts and takes no hints. The `check()` SDK export returns the same envelopes verbatim.

### `check` success

When every snapshot is valid and the branches commute, `check` emits the `ok` envelope and exits with code `0`:

```json
{
  "status": "ok",
  "dialect": "postgresql"
}
```

`dialect` is always present, consistent with every other `status: "ok"` response.

For postgresql, `check` also compares the schema with the migrations folder when it has a schema path: the `schema` field of the config file, or the `--schema` option. The schema equals the migrations when `generate` would write no SQL. If they differ, the `ok` envelope has `warnings`, and the exit code is still `0`:

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "warnings": [
    {
      "kind": "schema_changed",
      "message": "The schema differs from the migrations. The newest migration is 20260101120002_email. Run drizzle-kit generate --explain to see the difference, and drizzle-kit generate to write a migration for it."
    }
  ]
}
```

Each warning is `{ kind, message }`. `message` is plain text for a person. `kind` is one of:

| `kind` | meaning | what to do |
| --- | --- | --- |
| `schema_changed` | The folder has one leaf or no migration, and the schema differs from its state. `generate` would write a migration. | Run `generate --explain` to see the difference, then `generate`. |
| `merge_needed` | The folder has several leaves, and the schema differs from their combined state. `generate` would write a merge migration. This is how a team learns after a git merge that `generate` must run before `migrate`. | Run `generate --explain` to see the difference, then `generate`. |
| `not_compared` | `check` could not compare: no file matches the schema path, the schema fails to load, the schema has errors, a leaf of the folder does not reconstruct, or the comparison itself fails. The result of `check` for the folder stays the same. | Fix what `message` names. `generate` would fail in the same way. |

The difference can go in either direction. If the schema lacks something that the migrations hold, `generate` writes a migration that drops it, so read the `--explain` output first.

`warnings` is absent when there is nothing to report and when `check` has no schema path. The comparison loads the schema files, as `generate` does, and writes nothing. In text mode, `check` prints the messages in place of the success line.

### `check` integrity errors

When a snapshot fails integrity validation, `check` emits an `error` envelope with `code: "check_error"` and a `kind` discriminator, and exits with code `1`. The meta is flattened into `error`, so `kind` and `snapshot` are siblings of `code`:

```json
{
  "status": "error",
  "error": {
    "code": "check_error",
    "kind": "unsupported",
    "snapshot": "drizzle/20260101120002_email/snapshot.json"
  }
}
```

`kind` is one of:

- `unsupported`: the snapshot was written by a Drizzle Kit version that this binary cannot read.
- `malformed`: the snapshot cannot be read, or its postgres history is broken. The cases are listed below.
- `non_latest`: the snapshot is in an older format. Run `drizzle-kit up`.
- `order`: postgres only. A migration folder sorts before the folder of one of its parents. `parentSnapshot` is the path of the parent's `snapshot.json`.

`snapshot` is the path of the snapshot file that has the problem.

`generate`, `migrate` and `pull` read the migrations folder through the same loader, so they return the same `check_error` envelopes. `generate` and `migrate` also run the full `check` first. `up` checks only a folder that it converts. See [`up` errors](#up-errors).

For postgres, `check` and `migrate` read only the shape of the snapshots, their parent links and their stored statements. They reconstruct no state, so a snapshot whose deltas do not apply does not stop them. `generate` reconstructs the state of every leaf before it writes, and `check` with a schema path reconstructs a state to compare it with the schema. A failed reconstruct stops `generate` with `kind: "malformed"`, and in `check` it gives a warning of kind `not_compared`.

In a postgres folder, the loader checks the history before anything else. The JSON envelope carries no message. The last column shows the message that `--output text` prints, with the fix. Each case below stops the command with `kind: "malformed"`:

| case | extra keys | message and fix |
| --- | --- | --- |
| A `snapshot.json` is not valid JSON (for example because it still has git conflict markers), has no string `id`, or has no `prevIds` array | none | `<path> data is malformed. Restore the file from git, or fix the JSON in it by hand.` |
| No snapshot in the history is a base snapshot, because the first migration folder is gone | none | `Cannot reconstruct snapshot <folder>: its history does not reach a base snapshot. Restore the first migration folder from git, or delete <folder> and every later migration, then run generate again.` |
| A parent listed in `prevIds` is not in the folder | `parentId`: the id of the missing parent | `Cannot reconstruct snapshot <folder>: snapshot <parentId> is missing from the migrations folder. Restore the missing migration folder from git, or delete <folder> and every later migration, then run generate again.` |
| The folder has a second base snapshot, because two git branches each started from an empty folder. `snapshot` is the base snapshot with the newer folder name | `baseSnapshot`: the path of the other base snapshot | `The migrations folder has two base snapshots, in <folder> and <folder>. A folder must have one base snapshot, which is its first migration. Delete one of the two migration folders together with every migration that follows it, then run generate again.` |

A wrong folder order stops the command with `kind: "order"`:

| case | extra keys | message and fix |
| --- | --- | --- |
| A folder name sorts before the name of one of its parents | `parentSnapshot`: the path of the parent's `snapshot.json` | `Migration <folder> sorts before its parent <parent folder>, so migrate can run it first. Rename the folders so that <folder> sorts after <parent folder>.` |

After these checks, `check` validates every snapshot against the format of its dialect. A snapshot that does not match gives `kind: "malformed"` with only the `snapshot` key. The cases without an extra key differ in the file at `snapshot`, so a caller reads that file to tell them apart.

Two more cases of `kind: "malformed"` come only from `generate`, after the folder passed `check`:

| case | extra keys | message and fix |
| --- | --- | --- |
| A leaf does not reconstruct: a delta in the history of the leaf at `snapshot` throws | none | `Cannot reconstruct the state of migration <folder>: <reason> Restore the migration folder from git, or delete <folder> and every later migration, then run generate again.` |
| Every leaf reconstructs, and the combined state of the leaves does not: a delta of the snapshot at `snapshot` gives a key to a second entity | none | `Cannot reconstruct the combined state at migration <folder>: <reason> Restore the migration folder from git, or delete <folder> and every later migration, then run generate again.` |

Example of a missing parent:

```json
{
  "status": "error",
  "error": {
    "code": "check_error",
    "kind": "malformed",
    "snapshot": "drizzle/20260101120003_rename/snapshot.json",
    "parentId": "2b39a1e8-3f89-4842-916d-6998b0ac6304"
  }
}
```

For the snapshot history, deleting the newest migration folder is safe, and so is deleting a migration folder together with every later one. The next `generate` continues from the snapshot that is then the newest. Deleting a merge folder opens its branches again, and the next `generate` merges them again.

### `check` conflicts

When the branches do not commute, `check` emits an `error` envelope with `code: "check_error"`, `kind: "conflicts"`, a `conflicts` count, a `details` array and, for postgresql, a `fix` object, and exits with code `1`. For the other dialects, `--ignore-conflicts` turns this error into an `ok` envelope:

```json
{
  "status": "error",
  "error": {
    "code": "check_error",
    "kind": "conflicts",
    "conflicts": 1,
    "details": [
      {
        "parentId": "0b6e7a52-4c1d-4f0e-9a37-2f1c8d5e6a10",
        "parentPath": "drizzle/20260101120001_main",
        "branches": [
          {
            "leafId": "8e2f4b19-7a63-4d58-b0c4-5d9e1f3a2c77",
            "leafPath": "drizzle/20260101120002_a",
            "statementDescription": "create_table: likes in public schema (20260101120002_a)",
            "target": { "kind": "table", "name": "likes", "schema": "public" },
            "action": "create_table"
          },
          {
            "leafId": "c41d9e07-2b85-4f3a-8e6d-a17b0c5f9e24",
            "leafPath": "drizzle/20260101120005_b",
            "statementDescription": "create_table: likes in public schema (20260101120005_b)",
            "target": { "kind": "table", "name": "likes", "schema": "public" },
            "action": "create_table"
          }
        ]
      }
    ],
    "fix": {
      "migrations": ["drizzle/20260101120002_a", "drizzle/20260101120005_b"],
      "customMigrations": []
    }
  }
}
```

Key semantics:

- `conflicts`: the conflict count. `details.length === conflicts`.
- `details[]`: one entry per conflict.
  - `parentId`: the id of the fork point, the newest snapshot in the history of both leaves. It is the origin id `00000000-0000-0000-0000-000000000000` when the two leaves have no common snapshot.
  - `parentPath`: the folder of the fork point, present only when the conflict has one.
  - `branches`: always a two-element array, one entry for each branch. Each entry is `{ leafId, leafPath, statementDescription, target, action }`. `leafId` and `leafPath` are the id and the folder of the last migration in that branch (`null` when the branch is empty). `statementDescription` describes the conflicting statement. `target` is `{ kind, name, schema?, table? }` for the entity that the statement changes, and `action` is the statement type.
- `fix`: postgresql only. `migrations` lists the folders that `generate --fix-conflicts` deletes, in folder-name order: the migrations that hold the conflicting statements that check reports, on both branches, and all their children. Check reports one conflict for each pair of branches, so the fix checks the rest again and repeats until no conflict is left. A migration that conflicts only with a deleted migration stays. `customMigrations` lists the custom migrations among them (diff snapshots with `deltas: []`), whose SQL the fix loses.

For postgres, `check` compares every pair of leaves. A leaf's branch is the set of snapshots in its history that are missing from the other leaf's history. `check` reads the stored `statements` of each snapshot in a branch, and compares every statement of one branch with every statement of the other. A change and its later reversal on the same branch still count, and `statementDescription` ends with the folder that the statement comes from. A merge snapshot adds only the statements of its own change. Two equal statements on two branches are one change, and no conflict, when their SQL gives the same result on a second run: for example `SET NOT NULL` on one column in both branches. Two different changes of one object conflict, and so do two equal statements whose SQL fails on a second run, such as a new column. A `DISABLE ROW LEVEL SECURITY` on one branch also conflicts with a new policy for the same table on the other branch. This SQL runs in either order, but postgres does not enforce a policy on a table without row level security. For `mysql`, `sqlite` and `turso`, `check` compares the full state at each fork parent with the full state of each leaf below it. The other dialects have no branch check.

If `check` passes and the folder has several leaves, the next `generate` writes a merge migration, unless the combined state of the leaves already equals the schema. For postgresql, `check` returns a warning when the merge migration is needed. See [Postgres snapshot format 9](#postgres-snapshot-format-9) for what a postgres merge stores.

For postgresql, `generate --fix-conflicts` resolves conflicts. It deletes the folders in `fix.migrations` and generates one new migration from the schema. If the remaining history has several leaves, that migration merges them. The fix deletes nothing while `generate` still returns `missing_hints`. It also deletes nothing in explain mode, where the result lists the folders that it would delete in `fix`. Every database that ran a deleted migration must be reset.

For `mysql`, `sqlite` and `turso`, `--ignore-conflicts` makes `generate` write the merge even though the branches conflict. postgresql rejects `--ignore-conflicts`, and the other dialects reject `--fix-conflicts`, with `code: "unsupported_command_dialect_error"` and the meta `{ command, dialect, option }`.

### `check` exit codes

| outcome | envelope | exit code |
| --- | --- | --- |
| valid (snapshots intact, branches commute) | `{ status: "ok", dialect }` | `0` |
| valid, and the schema differs from the migrations (postgresql) | `{ status: "ok", dialect, warnings }` | `0` |
| integrity error (`unsupported` / `malformed` / `non_latest` / `order`) | `{ status: "error", error: { code: "check_error", kind, snapshot, parentId?, parentSnapshot?, baseSnapshot? } }` | `1` |
| conflicts (no `--ignore-conflicts`) | `{ status: "error", error: { code: "check_error", kind: "conflicts", conflicts, details, fix? } }` | `1` |
| conflicts with `--ignore-conflicts` (not postgresql) | `{ status: "ok", dialect }` | `0` |
| `--ignore-conflicts` with postgresql | `{ status: "error", error: { code: "unsupported_command_dialect_error", command, dialect, option } }` | `1` |

## `pull`

`drizzle-kit pull --output json` introspects a live database and writes `schema.ts`, an optional `relations.ts`, and a snapshot to the configured `out` directory. The `pull()` SDK export returns the same envelope verbatim. `pull` is **ok-or-error only** — it never emits `missing_hints` (it diffs the introspected database against empty DDL, so there is no rename/data-loss consent surface) and never emits `no_changes` (a pull always writes the introspected files).

### `pull` success

On success `pull` emits a paths-manifest `ok` envelope and exits with code `0`. In a folder that already has migrations:

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "schemaPath": "drizzle/schema.ts",
  "relationsPath": "drizzle/relations.ts",
  "snapshotPath": "drizzle/20260427153000_calm_adam_warlock/snapshot.json"
}
```

Keys:

- `dialect` — always present, consistent with every other `status: "ok"` response.
- `schemaPath` — the written `schema.ts`. Always present.
- `snapshotPath` — the snapshot of the pulled schema. Always present. In an empty folder, `pull` writes a new migration folder, and for postgres its snapshot is a base snapshot. In a folder that already has migrations, `pull` writes no snapshot, and `snapshotPath` is the newest existing `snapshot.json`.
- `relationsPath?` — the written `relations.ts`. **Optional**: present for `postgresql`, `mysql`, `sqlite`, `turso`, `cockroach`, and `singlestore`; omitted for `mssql` (it does not generate a relations file).
- `migrationPath?` — **Optional**: the `migration.sql` of the new migration folder. Present when `pull` wrote a new migration folder, which happens when `out` has no migrations yet. Absent when the folder already had migrations. With `--init`, `pull` also records this migration as applied in the migrations table of the database, so that `migrate` does not run it again.

In an empty folder, `pull` writes a new migration folder:

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "schemaPath": "drizzle/schema.ts",
  "relationsPath": "drizzle/relations.ts",
  "snapshotPath": "drizzle/20260427153000_calm_adam_warlock/snapshot.json",
  "migrationPath": "drizzle/20260427153000_calm_adam_warlock/migration.sql"
}
```

On a connect, introspect, or `--init` migrate failure, `pull` emits a `status: "error"` envelope — most commonly [`database_driver_error`](#error-codes), whose meta is redacted to `{ database, packages, note? }` (the connection string / SQL / params are never spread into the envelope).

## `up`

`drizzle-kit up --output json` upgrades the migrations folder to the current layout and every snapshot to the current format of its dialect. The `up()` SDK export returns the same envelope verbatim.

`up` works in two steps:

1. For `postgresql`, `mysql`, `sqlite`, `turso` and `singlestore`: if the folder has `meta/_journal.json`, `up` moves every migration into its own `<out>/<YYYYMMDDHHMMSS>_<name>/` folder with `migration.sql` and `snapshot.json`, and it deletes the `meta` folder. The time is the UTC time of the journal entry, and `<name>` is the tag without its `<NNNN>_` prefix.
2. `up` rewrites every `snapshot.json` that is older than the current format of its dialect.

For postgres, step 2 converts formats 4 to 8 to format 9:

- A snapshot with no parent becomes a base snapshot with the full state.
- Every other snapshot becomes a diff snapshot. Its deltas are computed from its parent's state, or from its combined state for a merge. The renames that the old snapshot recorded become the rename decisions, so each one becomes one `rename` delta. Format 8 records them in `renames`, and formats 5 to 7 record them in `_meta`.
- The diff keeps the parent's name for a constraint with a generated name. If the old file stores another name for that constraint, `up` adds a `drop` and a `create` of the constraint at the end of the deltas, so that the reconstructed state has the name from the old file. drizzle-kit 0.x dropped such a constraint and added it under the new name, so these deltas match its SQL.
- A primary key whose name is not explicit and is the Postgres default `<table>_pkey` keeps the name from the parent's state. Postgres keeps that name when the table is renamed, and drizzle-kit 0.x wrote no SQL for the key, but files converted from 0.x name the key after the new table. `up` ignores the name of such a key when it compares a reconstructed state with the old file.
- A merge keeps all its parents, and the parent with the newest folder name moves to the first place in `prevIds`.
- Snapshot ids stay the same, and `migration.sql` files do not change.

For postgres, `up` does both steps in memory first. It converts every snapshot, reconstructs the state of every converted snapshot from the new snapshots, and compares it with the state in the old file. Only then it moves and writes files. If one step fails, `up` moves no file and writes no file, so the folder stays as it was. `up` writes no backup, because git keeps the old files. A folder that holds only format 9 snapshots stays as it is. `up` does not validate such a folder, and `check` does.

### `up` success

```json
{
  "status": "ok",
  "dialect": "postgresql",
  "upgraded": [
    "drizzle/20260101120001_init/snapshot.json",
    "drizzle/20260101120002_email/snapshot.json"
  ]
}
```

`upgraded` is the array of rewritten snapshot paths; `[]` means every snapshot was already at the latest format (a no-op).

### `up` errors

A postgres conversion that fails returns `command_output_error` with `command: "up"` and a `kind`. No file is changed. `snapshot` is the path of the snapshot that failed, where the file is now:

| `kind` | extra keys | when |
| --- | --- | --- |
| `history` | `snapshot` and `parentId`: the id of the missing parent | A migration was deleted in the middle of the history: the snapshot at `snapshot` follows a parent that is not in the folder. Restore the missing migration from git. If that is not possible, delete the migration of `snapshot` and every later migration, run `up`, and generate them again. |
| `history` | `entry`: the tag of the journal entry, and `sql`: the path where `up` expects the SQL file | A journal entry in `meta/_journal.json` has no SQL file. Restore the file from git and run `up` again. |
| `history` | `snapshot` and `baseSnapshot`: the two first migrations, the one with the newer folder name in `snapshot` | Two migrations follow no other migration, because two git branches each started from an empty folder. A folder must have one first migration. Delete one of the two migrations together with every migration that follows it, run `up` again, and then run `generate`. |
| `history` | `snapshot`: the merge that cannot be reconstructed | An old merge joins branches that gave one name to two different entities, for example one branch renamed a schema to a name that the other branch created. Format 9 does not support such a merge. Delete the merge migration, every later migration, and the migrations of one of its branches after the fork point. After that, run `up` again, and then run `generate`. A database that ran a deleted migration must be reset. |
| `history` | `snapshot`: the merge that cannot be reconstructed | An old merge joins branches that each created an entity with the same key and other values, for example a column with one name and two types. Format 9 does not support such a merge. A merge whose branches created equal entities converts. The fix is the same: delete the merge migration, every later migration, and the migrations of one of its branches after the fork point. After that, run `up` again, and then run `generate`. A database that ran a deleted migration must be reset. |
| `history` | none | Another step of the conversion failed. The message of `--output text` names the reason. |
| `malformed` | none | A format 9 `snapshot.json` does not pass the format 9 validator while the folder also has a snapshot to convert, or a format 8 file has no `ddl` or `prevIds` array. Restore it from git and run `up` again. A broken snapshot of format 4 to 7 gives `internal_error` instead. If every snapshot is already format 9, `up` does not validate them and returns `upgraded: []`. |
| `invalid_snapshot` | none | The converted snapshot does not pass the format 9 validator. This is a bug in drizzle-kit. Keep the old files and report the issue. |
| `state_mismatch` | `entity`: the first entity that differs, as `<entity type> <schema>.<table>.<name>` | The reconstructed state of the converted snapshot differs from the state in the old file. This is a bug in drizzle-kit. Keep the old files and report the issue. |

```json
{
  "status": "error",
  "error": {
    "code": "command_output_error",
    "command": "up",
    "kind": "state_mismatch",
    "snapshot": "drizzle/20260101120003_rename/snapshot.json",
    "entity": "pks public.accounts.accounts_pkey"
  }
}
```

In a postgres folder that it converts, `up` also returns `check_error` for a `snapshot.json` that is not valid JSON (`kind: "malformed"`) and for a folder that sorts before one of its parents (`kind: "order"`). See [`check` integrity errors](#check-integrity-errors). In a folder with `meta/_journal.json`, the migration folders do not exist yet. The `malformed` message names the file under `meta/`. The `order` message and the messages of the conversion errors name the journal entries, for example `0001_posts`. The `order` error then means that the time in `when` of a journal entry is not at least one second after the time of its parent, and the fix is to correct `when` in `meta/_journal.json`.

The move out of `meta/_journal.json` can also fail. It returns `migration_snapshot_not_found_error` when the journal lists a migration whose `meta/<n>_snapshot.json` is missing. If `<tag>.sql` is missing, `up` moves the one SQL file whose name starts with the `<NNNN>_` prefix of the tag. It returns `migration_sql_files_conflict_error` (meta `prefix`) when several SQL files have that prefix. If no SQL file has that prefix, postgres returns the `history` error above. The other dialects skip the migration, and its snapshot is deleted with the `meta/` folder.

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
