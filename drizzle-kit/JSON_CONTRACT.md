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

### Snapshot helpers in `drizzle-kit/api-postgres`

`drizzle-kit/api-postgres` exports helpers for tools that keep postgres snapshots themselves. They return format 9 state snapshots: a base, or a checkpoint when the snapshot has parents. See [Postgres snapshot format 9](#postgres-snapshot-format-9).

- `generateDrizzleJson(imports, prevId?, schemaFilters?)` returns the state of the schema in `imports`. Without `prevId`, or with an empty string, it returns a base snapshot. With `prevId`, it returns a checkpoint whose `prevIds` are the given parents. `prevId` is a string or an array of strings.
- `generateMigration(prev, cur)` returns the SQL statements that turn `prev` into `cur`. Each argument is a format 9 base or checkpoint, or a snapshot of an older format, which it upgrades in memory. It throws on a diff snapshot, because a diff snapshot holds only the changes of one migration.
- `up(snapshot)` converts one snapshot of an older format to a format 9 base or checkpoint and returns `{ snapshot, hints }`. To convert a migrations folder, run `drizzle-kit up`.
- `reconstruct(files, id?)` rebuilds a state from the snapshot files of a folder. `files` maps each migration folder name to the parsed JSON of its `snapshot.json`. It returns the state of snapshot `id`. Without `id`, it returns the state of the only leaf, and it throws when the folder has several leaves. For an old format or a broken history, it throws the same errors as the CLI.

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

After `generate --fix-conflicts` (postgresql only), the `ok` or `no_changes` envelope also has `deleted_migrations`: the migration folders that the fix deleted. `no_changes` then means that the rest of the history already matched the schema, so the fix wrote no new migration. If some of them were custom migrations, `deleted_custom_migrations` lists those folders too. See [`check` conflicts](#check-conflicts).

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

After `generate --fix-conflicts`, a `no_changes` envelope can also have `deleted_migrations` and `deleted_custom_migrations`. The fix then deleted those folders, and the rest of the history already matched the schema.

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
| `check_error` | see [`check` outcomes](#check) | `postgresql`, `mysql`, `sqlite`, `turso`, `mssql`, `cockroach`, `singlestore` | A command that reads the migrations folder found a snapshot-integrity problem (`kind: 'unsupported' \| 'malformed' \| 'non_latest'`, carries `snapshot`, and for a broken postgres history also `parentId` or `parentSnapshot`) or unreported branch conflicts (`kind: 'conflicts'`, carries `conflicts` + `details`). See [`check`](#check) below. |
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

Each folder name must sort after the names of all its parents, because migrate runs the SQL in folder-name order. `generate` names a new folder after the current time. If the clock is behind the newest parent, `generate` uses the time of that parent plus one second. In a postgres folder, a folder that sorts before one of its parents stops every command with `check_error` kind `malformed`. See [`check` integrity errors](#check-integrity-errors).

### Snapshot formats per dialect

Only postgres uses snapshot format 9. The other dialects store the full schema state in every snapshot.

| dialect | `version` | content |
| --- | --- | --- |
| `postgresql` | `"9"` | base, checkpoint and diff snapshots, described below |
| `mysql` | `"6"` | full state |
| `sqlite`, `turso` | `"7"` | full state |
| `mssql` | `"2"` | full state |
| `singlestore` | `"2"` | full state |
| `cockroach` | `"1"` | full state |

A full-state snapshot has the shape `{ version, dialect, id, prevIds, ddl, renames }`. `ddl` holds every entity of the schema after the migration. `renames` lists the renames of that migration as `"<old name>-><new name>"` strings.

### Postgres snapshot format 9

```typescript
type Row = { entityType: string; [field: string]: unknown };

type BaseSnapshot = {
  type: 'base';
  version: '9';
  dialect: 'postgres';
  id: string;
  prevIds: ['00000000-0000-0000-0000-000000000000'];
  ddl: Row[];
};

type CheckpointSnapshot = {
  type: 'checkpoint';
  version: '9';
  dialect: 'postgres';
  id: string;
  prevIds: string[];
  ddl: Row[];
};

type DiffSnapshot = {
  type: 'diff';
  version: '9';
  dialect: 'postgres';
  id: string;
  prevIds: string[]; // at least one parent
  deltas: Delta[];
};

type Delta =
  | { op: 'create'; row: Row }
  | { op: 'drop'; key: string }
  | { op: 'alter'; key: string; set: Partial<Row> }
  | { op: 'rename'; key: string; set: Partial<Row> }
  | { op: 'relocate'; key: string; set: Partial<Row> };
```

- A **base snapshot** holds the full state. It is the first snapshot in the migrations folder. `generate` writes it for the first migration, and `pull` writes it into an empty migrations folder.
- A **diff snapshot** holds only the deltas of its own migration. `generate` writes one for every later migration. `generate --custom` writes one with `deltas: []`.
- A **checkpoint** holds a full state in the middle of a history. drizzle-kit reads checkpoints, and reconstruction starts at the nearest one. drizzle-kit never writes a checkpoint into a migrations folder. A checkpoint is supported only in linear history: a merge that would replay a branch with a checkpoint in it stops with an error. The [snapshot helpers](#snapshot-helpers-in-drizzle-kitapi-postgres) return checkpoints.

Format 9 snapshots have no `renames` field and store no statements. `generate` on an unchanged schema writes no folder.

Each row in `ddl`, and each `row` of a `create`, is one entity of the schema. `entityType` names its kind. For example, a column:

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

A key names one row. It is the entity type, a NUL character, and the identity fields of the row as a JSON array. In a JSON file the NUL character is written as `\u0000`, so the key of the column above is `"columns\u0000[\"public\",\"users\",\"email\"]"`.

| entity type | identity fields |
| --- | --- |
| `schemas`, `roles` | `name` |
| `tables`, `enums`, `sequences`, `views` | `schema`, `name` |
| `columns`, `indexes`, `fks`, `pks`, `uniques`, `checks`, `policies` | `schema`, `table`, `name` |
| `privileges` | `schema`, `table`, `grantor`, `grantee`, `type` |

The five delta ops:

| `op` | effect on the state |
| --- | --- |
| `create` | adds `row` |
| `drop` | removes the row at `key` |
| `alter` | assigns the fields in `set` to the row at `key`; the key does not change |
| `rename` | assigns `set` and stores the row under its new key; the user decided this rename |
| `relocate` | assigns `set` and stores the row under its new key, because another entity was renamed |

A delta changes only the row that its key names, so a rename that reaches other rows is stored row by row:

- A table rename is one `rename` of the table and one `relocate` for each row that belongs to the table (its columns, indexes, constraints, policies and privileges), each with `set: { "table": "<new name>" }`. A foreign key in another table that references the renamed table keeps its key, so it gets an `alter` of `tableTo`.
- A column rename is one `rename` of the column and one `alter` for each index or constraint whose column list names it.

To reconstruct the state of a snapshot, drizzle-kit follows the first parents back to the nearest base or checkpoint. From there it applies the deltas of every snapshot on that path of first parents, in order. The deltas of a merge snapshot on the path start from its combined state.

The combined state of a merge snapshot is built in three steps:

1. Copy the state of the first parent.
2. Take the snapshots in the merge's history that are missing from the first parent's history.
3. Apply their deltas in folder-name order. In this step only, a `drop`, `alter`, `rename` or `relocate` of a missing key is skipped, and a `create`, `rename` or `relocate` onto a taken key replaces the row there. A base in this set adds its rows as such creates. A checkpoint in this set stops the command with an error.

`generate` writes a merge only after the branches pass `check`, so a skipped or replaced delta occurs only in a merge that `drizzle-kit up` converted from format 8.

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
  "deltas": [
    { "op": "create", "row": { "schema": "public", "table": "users", "name": "age", "type": "integer", …, "entityType": "columns" } }
  ]
}
```

Format 8, the postgres format before format 9, stored the full state in every snapshot: `{ version: "8", dialect: "postgres", id, prevIds, ddl, renames }`.

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

`snapshot` is the path of the snapshot file that has the problem.

`generate`, `migrate`, `up` and `pull` read the migrations folder through the same loader, so they return the same `check_error` envelopes. `generate` and `migrate` also run the full `check` first.

In a postgres folder, the loader checks the history before anything else. Each case below stops the command with `kind: "malformed"`. The JSON envelope carries no message. The last column shows the message that `--output text` prints, with the fix:

| case | extra keys | message and fix |
| --- | --- | --- |
| A `snapshot.json` is not valid JSON (for example because it still has git conflict markers), has no string `id`, or has no `prevIds` array | none | `<path> data is malformed. Restore the file from git, or fix the JSON in it by hand.` |
| No snapshot in the history is a base snapshot, because the first migration folder is gone | none | `Cannot rebuild snapshot <folder>: its history does not reach a base snapshot. Restore the first migration folder from git, or delete <folder> and every later migration, then run generate again.` |
| A parent listed in `prevIds` is not in the folder | `parentId`: the id of the missing parent | `Cannot rebuild snapshot <folder>: snapshot <parentId> is missing from the migrations folder. Restore the missing migration folder from git, or delete <folder> and every later migration, then run generate again.` |
| A folder name sorts before the name of one of its parents | `parentSnapshot`: the path of the parent's `snapshot.json` | `Migration <folder> sorts before its parent <parent folder>, so migrate can run it first. Rename the folders so that <folder> sorts after <parent folder>.` |

After these checks, `check` validates every snapshot against the format of its dialect. A snapshot that does not match gives `kind: "malformed"` with only the `snapshot` key. The cases without an extra key differ in the file at `snapshot`, so a caller reads that file to tell them apart.

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

For postgres, `check` compares every pair of leaves. A leaf's branch is the set of snapshots in its history that are missing from the other leaf's history. `check` derives the statements of each snapshot in a branch, with the snapshot's `rename` deltas as the rename decisions, and compares every statement of one branch with every statement of the other. It does not keep generated names, so a `drop` and a `create` of a constraint in the deltas count as a drop and a create statement, as in the SQL of the migration. A change and its later reversal on the same branch still count, and `statementDescription` ends with the folder that the statement comes from. A merge snapshot adds only the statements of its own deltas. For `mysql`, `sqlite` and `turso`, `check` compares the full state at each fork parent with the full state of each leaf below it. The other dialects have no branch check.

If `check` passes and the folder has several leaves, the next `generate` writes a merge migration. See [Postgres snapshot format 9](#postgres-snapshot-format-9) for what a postgres merge stores.

For postgresql, `generate --fix-conflicts` resolves conflicts. It deletes the folders in `fix.migrations` and generates one migration from the rest of the history to the schema. If the remaining history has several leaves, that migration merges them. The fix deletes nothing while `generate` still returns `missing_hints`, and nothing in explain mode. Every database that ran a deleted migration must be reset, because the migrator skips a deleted migration without an error. In interactive mode, `generate` shows the conflict report and offers the same fix.

For `mysql`, `sqlite` and `turso`, `--ignore-conflicts` makes `generate` write the merge even though the branches conflict. postgresql rejects `--ignore-conflicts`, and the other dialects reject `--fix-conflicts`, with `code: "unsupported_command_dialect_error"` and the meta `{ command, dialect, option }`.

### `check` exit codes

| outcome | envelope | exit code |
| --- | --- | --- |
| valid (snapshots intact, branches commute) | `{ status: "ok", dialect }` | `0` |
| integrity error (`unsupported` / `malformed` / `non_latest`) | `{ status: "error", error: { code: "check_error", kind, snapshot, parentId?, parentSnapshot? } }` | `1` |
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

1. For `postgresql`, `mysql`, `sqlite`, `turso` and `singlestore`: if the folder has `meta/_journal.json`, `up` moves every migration into its own `<out>/<tag>/` folder with `migration.sql` and `snapshot.json`, and it deletes the `meta` folder.
2. `up` rewrites every `snapshot.json` that is older than the current format of its dialect.

For postgres, step 2 converts formats 4 to 8 to format 9:

- A snapshot with no parent becomes a base snapshot with the full state.
- Every other snapshot becomes a diff snapshot. Its deltas are computed from its parent's state, or from its combined state for a merge. The renames that the old snapshot recorded become the rename decisions, so they become `rename` deltas. Format 8 records them in `renames`, and formats 5 to 7 record them in `_meta`.
- The diff keeps the parent's name for a constraint with a generated name. If the old file stores another name for that constraint, `up` adds a `drop` and a `create` of the constraint at the end of the deltas, so that the rebuilt state has the name from the old file. drizzle-kit 0.x dropped such a constraint and added it under the new name, so these deltas match its SQL.
- A primary key whose name is not explicit and is the Postgres default `<table>_pkey` keeps the name from the parent's state. Postgres keeps that name when the table is renamed, and drizzle-kit 0.x wrote no SQL for the key, but files converted from 0.x name the key after the new table. `up` ignores the name of such a key when it compares a rebuilt state with the old file.
- A merge keeps all its parents, and the parent with the newest folder name moves to the first place in `prevIds`.
- Snapshot ids stay the same, and `migration.sql` files do not change.

Before it rewrites any snapshot, `up` rebuilds the state of every converted snapshot from the new files and compares it with the state in the old file. If one state differs, or if a snapshot cannot be converted, `up` rewrites no `snapshot.json`. Step 1 runs before this check, so a folder that had `meta/_journal.json` is already moved to the `<out>/<tag>/` layout when the error comes. `up` writes no backup, because git keeps the old files. A folder that is already in format 9 stays as it is.

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

A postgres conversion that fails returns `command_output_error` with `command: "up"`, a `kind`, and `snapshot`, the path of the snapshot that failed:

| `kind` | extra keys | when |
| --- | --- | --- |
| `malformed` | none | A `snapshot.json` in the folder is not a valid snapshot of its format. Restore it from git and run `up` again. |
| `invalid_snapshot` | none | The converted snapshot does not pass the format 9 validator. This is a bug in drizzle-kit. Keep the old files and report the issue. |
| `state_mismatch` | `entity`: the first entity that differs, as `<entity type> <schema>.<table>.<name>` | The rebuilt state of the converted snapshot differs from the state in the old file. This is a bug in drizzle-kit. Keep the old files and report the issue. |

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

`up` reads the folder through the same loader as the other commands, so a broken postgres history stops it with a `check_error` first. See [`check` integrity errors](#check-integrity-errors). The move out of `meta/_journal.json` can also fail. It returns `migration_snapshot_not_found_error` when the journal lists a migration whose `meta/<n>_snapshot.json` is missing, and `migration_sql_files_conflict_error` when the SQL file of a journal entry does not have the name of its tag.

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
