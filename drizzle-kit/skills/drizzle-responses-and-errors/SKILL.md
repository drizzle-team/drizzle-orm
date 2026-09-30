---
name: drizzle-responses-and-errors
description: Decode the drizzle-kit response JSON envelope, error codes, and exit codes — from the CLI `--output json` output or any drizzle-kit SDK return value. Load whenever drizzle-kit output contains a non-zero exit, an error code (`config_validation_error`, `database_driver_error`, `invalid_hints`, `unsupported_schema_change`, etc.), or any drizzle-kit JSON response needs parsing or inspection.
metadata:
  version: "1.0.0"
---

# Drizzle responses and errors

If the `drizzle` skill has not been loaded yet this session, load it first — it carries the staleness check and the MCP-vs-CLI surface-selection rule that govern every drizzle-kit invocation.

Both invocation surfaces share one envelope: the CLI prints it on stdout when `--output json` is passed, and the SDK functions `generate(...)` / `push(...)` / `check(...)` return the same object. The discriminator is always `status`. Decoding logic written for one surface works on the other. This skill does not invoke commands or author schemas — see `drizzle-generate` and `drizzle-push` for invocation, `drizzle-hints` for the `missing_hints` resolution loop.

## Response envelope

The discriminated union (identical for CLI stdout and SDK return value):

| status            | exit code | shape                                                   |
| ----------------- | --------- | ------------------------------------------------------- |
| `'ok'`            | 0         | `{ status, dialect, ... }` (per-operation extras below) |
| `'no_changes'`    | 0         | `{ status, dialect }`, plus the fields below when `--fix-conflicts` deleted migrations |
| `'missing_hints'` | 2         | `{ status, unresolved: MissingHint[] }`                 |
| `'error'`         | 1         | `{ status, error: { code, ...meta } }`                  |

Per-operation extras on `'ok'`:

- `generate` (write mode) — `{ status, dialect, migration_path }`. When `--fix-conflicts` deleted migrations, both `ok` and `no_changes` also carry `deleted_migrations` and `deleted_custom_migrations?`, the folders that the fix deleted. If the folder has no conflict, the fix deletes nothing and neither key is present
- `push` (write mode) — `{ status, dialect }`
- `pull` — `{ status, dialect, schemaPath, snapshotPath, relationsPath?, migrationPath? }` (`relationsPath?` omitted for mssql; `migrationPath?` only when pull wrote a new migration folder into an empty `out` folder). `pull` is ok-or-error only — never `missing_hints`, never `no_changes`.
- `export` — `{ status, dialect, statements, warnings }` (the individual SQL statements plus rendered warnings — there is no joined `sql` field).
- `up` — `{ status, dialect, upgraded }` (`upgraded` is the array of rewritten snapshot paths; `[]` means a no-op).
- `--explain` (either command, non-empty diff) — `{ status, dialect, statements, hints }`

`'missing_hints'` carries `unresolved`, an array of items the agent must resolve before retrying. Each item is `{ type: 'rename_or_create', kind, entity }` or `{ type: 'confirm_data_loss', kind, entity, reason, reason_details? }`. The resolution loop lives in the `drizzle-hints` skill.

The table above describes `--output json`. Under `--output text` + non-TTY the same `missing_hints` information renders as the human-readable missing-decisions report on stdout, still exiting with code 2 — see the `drizzle-output-modes` skill for the text-report shape.

`'error'` carries `error.code` plus `meta` keys (variable per code). The runtime serializer flattens `{ code, ...meta }` into the `error` object — `code` is always present; the remaining keys vary. The envelope is the only shape an agent observes; no other fields are surfaced.

Exit code is the canonical second signal — agents spawning the CLI can branch on either the envelope or the exit code; agents using the SDK only see the envelope.

## Error codes

The canonical subset surfacing from `generate` and `push`. `code` is the discriminator; `meta` keys are listed alongside.

| code                                | when                                                                                | meta keys                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `invalid_hints`                     | hints payload could not be loaded, parsed, validated, or matched to the diff        | `source: 'file'\|'inline'`, `path?`, `issues?`, `kind?`, `from?` |
| `unsupported_schema_change`         | the diff would emit DDL the target dialect cannot execute (see variants below)      | `kind`, plus per-variant keys                                   |
| `check_error`                       | a command that reads the migrations folder found a snapshot-integrity problem or unreported branch conflicts (see below) | `kind: 'unsupported'\|'malformed'\|'non_latest'\|'conflicts'`, `snapshot?`, `parentId?`, `parentSnapshot?`, `conflicts?`, `details?` |
| `query_error`                       | runtime SQL against the live DB threw                                               | `sql`, `params`                                                 |
| `internal_error`                    | uncaught exception escaped the run boundary — likely a bug to report                | `message`                                                       |
| `config_validation_error`           | `drizzle.config.ts` failed shape validation                                         | `issues?` (zod-style records)                                   |
| `config_file_not_found_error`       | config path did not resolve to a file                                               | `path`                                                          |
| `schema_files_not_found_error`      | schema glob(s) matched zero files                                                   | `paths`                                                         |
| `missing_required_params_error`     | a required CLI flag or config field was absent                                      | `params`                                                        |
| `ambiguous_params_error`            | a flag conflicts with a `defineConfig` field (or two flags collide)                 | `command`, `configOption`                                       |
| `unsupported_command_dialect_error` | the requested command or option isn't valid for the chosen dialect                  | `command`, `dialect?`, `option?`                                |
| `config_connection_error`           | `dbCredentials` shape doesn't match the chosen driver                               | `driver`, `params`, `command?`                                  |
| `database_driver_error`             | driver-specific connect failure — usually a missing or version-mismatched package; also arises from `pull`'s connect/introspect span and its `--init` migrate span | `database`, `packages`, `note?`                                 |
| `orm_version_error`                 | `drizzle-orm` is missing, too old, or `drizzle-kit` itself is outdated              | `kind: 'orm_missing'\|'orm_too_old'\|'kit_outdated'`            |
| `required_packages_error`           | one or more dialect driver packages need installing                                 | `packages`                                                      |
| `migrations_outdated_error`         | migrations folder format is outdated and needs upgrading                            | `out`                                                           |
| `command_output_error`              | a command could not produce its result; for `up`, a snapshot could not be converted | `command`, plus per-command keys (for `up`: `kind`, `snapshot`, `entity?`) |

Ordering above is roughly most-likely-first from `generate` / `push`. Other codes can surface (see the live `drizzle-kit` source); the table covers the curated subset relevant to the day-to-day workflow.

## Unsupported schema changes

`unsupported_schema_change` is a discriminated meta union — `meta.kind` selects the variant.

| meta.kind                            | dialect(s)         | meta keys                                                       |
| ------------------------------------ | ------------------ | --------------------------------------------------------------- |
| `drop_pk_dependency`                 | mysql, singlestore | `kind`, `table`, `columns`, `blocking_fks`                      |
| `fk_target_not_unique`               | mysql, singlestore | `kind`, `table`, `columns`, `table_to`, `columns_to`            |
| `rename_blocked_by_check_constraint` | mssql              | `kind`, `schema`, `table`, `from`, `to`                         |
| `rename_schema_unsupported`          | mssql              | `kind`, `from`, `to`, `dialect: 'mssql'`                        |

When fired:

- `drop_pk_dependency` — `ALTER TABLE … DROP PRIMARY KEY` is rejected because a foreign key references the dropped columns and no covering UNIQUE index exists. Add a UNIQUE on those columns first, then drop.
- `fk_target_not_unique` — `CREATE FOREIGN KEY` is rejected because the referenced columns on `table_to` are neither UNIQUE nor a PRIMARY KEY. Add a UNIQUE on `columns_to` first.
- `rename_blocked_by_check_constraint` — `sp_rename` of `schema.table.from` is rejected because the column appears in a CHECK constraint. Drop the constraint, rename, recreate the constraint.
- `rename_schema_unsupported` — MSSQL does not support schema rename at all. Recreate the schema and move objects manually, or keep the old schema name.

## Check errors

`check_error` surfaces from the `check()` SDK export and `drizzle-kit check`, returning the envelope on integrity or conflict failures exactly as the CLI does. `generate` and `migrate` run the same check before they start, and `up` and `pull` read the migrations folder through the same loader, so all of them can return it. It exits with code 1 and carries a `kind` discriminator.

| meta.kind     | meta keys                | when fired                                                              |
| ------------- | ------------------------ | ---------------------------------------------------------------------- |
| `unsupported` | `kind`, `snapshot`       | a snapshot was written by a newer drizzle-kit and cannot be read       |
| `malformed`   | `kind`, `snapshot`, `parentId?`, `parentSnapshot?` | a snapshot cannot be read, or the postgres history of the folder is broken (cases below) |
| `non_latest`  | `kind`, `snapshot`       | a snapshot is in an older format; run `drizzle-kit up`                 |
| `conflicts`   | `kind`, `conflicts`, `details`, `fix?` | branches in the migrations folder do not commute |

For the integrity kinds, `snapshot` is the path of the snapshot file that has the problem. `malformed` has these cases:

| keys besides `kind` and `snapshot` | case | fix |
| --- | --- | --- |
| none | the file at `snapshot` is not valid JSON (for example because git left conflict markers in it), has no string `id`, or has no `prevIds` array | restore the file from git, or fix the JSON |
| none | the file at `snapshot` is valid JSON but does not match the snapshot format of its dialect | restore the file from git |
| none | postgres only: the history of `snapshot` reaches no base snapshot, because the first migration folder is gone | restore the first migration folder from git, or delete the migration of `snapshot` and every later migration, then run `generate` again |
| `parentId` | postgres only: the parent with that id is missing from the folder | restore the missing migration folder from git, or delete the migration of `snapshot` and every later migration, then run `generate` again |
| `parentSnapshot` | postgres only: the folder of `snapshot` sorts before the folder of its parent `parentSnapshot`, so migrate could run it first | rename the folder of `snapshot` so that it sorts after the parent folder |

The three cases without an extra key differ in the file at `snapshot`, so read that file to tell them apart. Under `--output text`, the message names the case and the fix. The `drizzle-migrations` skill explains the migrations folder, base and diff snapshots, and these fixes in more detail.

For `conflicts`, `conflicts` is the count and `details` is an array of length `conflicts`. Each entry is `{ parentId, parentPath?, branches }`. `parentId` is the fork point: the newest snapshot that is in the history of both leaves. `parentPath` is its folder. `branches` is always a two-element array, one entry for each branch, and each entry is `{ leafId, leafPath, statementDescription, target, action }`. `leafId` / `leafPath` are the id and folder of that branch's newest migration (`null` when the branch is empty). `statementDescription` describes the conflicting statement; for postgres it ends with the folder of the migration that the statement comes from. `target` is `{ kind, name, schema?, table? }`, the entity that the statement changes, and `action` is the statement type. For postgresql, `fix` is `{ migrations, customMigrations }`: the folders that `generate --fix-conflicts` deletes, and the custom migrations among them.

## Decoding pattern (CLI + SDK)

Narrow on `status` and then on `error.code`:

```typescript
import { generate } from 'drizzle-kit';

const response = await generate({ dialect: 'postgresql', schema: './src/db/schema.ts', out: './drizzle' });

switch (response.status) {
  case 'ok':
    // response.dialect is present; response.migration_path when not in explain mode
    break;
  case 'no_changes':
    // response.dialect is present; nothing to do
    break;
  case 'missing_hints':
    // response.unresolved holds the items to resolve (see drizzle-hints)
    break;
  case 'error':
    switch (response.error.code) {
      case 'config_file_not_found_error':
        // response.error.path
        break;
      case 'invalid_hints':
        // response.error.source, response.error.issues, etc.
        break;
      case 'check_error':
        // migrations-folder pre-flight gate failed; response.error.kind, response.error.snapshot / conflicts / details
        break;
      // ...other codes from the table above
    }
    break;
}
```

CLI equivalent — parse `stdout` as JSON, switch on `response.status` the same way. Exit codes map: `exit 0` for `ok` / `no_changes`, `exit 1` for `error`, `exit 2` for `missing_hints`.

## Troubleshooting

Common failure modes and their fixes — keyed by `error.code` / `meta.kind`:

- `config_file_not_found_error` — `meta.path` names the missing file. Pass `--config <path>` (CLI) or point the SDK call's `configPath` at the right location; the default lookup is `drizzle.config.ts` in CWD.
- `schema_files_not_found_error` — `meta.paths` lists the globs that resolved to nothing. Use a concrete `.ts` extension in the path, or expand the glob to cover the directory the schema lives in.
- `config_validation_error` — `meta.issues` carries a zod-style array (`path`, `message`). Fix the named fields in `drizzle.config.ts`; the most common cause is a missing `dialect` or a `dbCredentials` block whose shape doesn't match the dialect.
- `missing_required_params_error` — `meta.params` names the missing fields (e.g. `['dialect']`). Add them via config or CLI flag.
- `ambiguous_params_error` — a flag and a `defineConfig` field both set the same value. Pick one source of truth — `meta.command` plus `meta.configOption` name the conflict.
- `config_connection_error` — the `dbCredentials` keys don't match what `meta.driver` expects. `meta.params` lists the keys the driver needs. Reshape `dbCredentials` accordingly.
- `database_driver_error` — driver could not connect. `meta.packages` lists the npm packages required for the driver; install them. `meta.note` may carry a connection-specific hint (e.g. SSL). Beyond `push`, this also fires from `pull`'s connect/introspect span and the `--init` migrate span — the meta is always the redacted `{ database, packages, note? }`; the connection string, SQL, and params are never spread into the envelope.
- `orm_version_error` — `meta.kind` discriminates: `orm_missing` (install `drizzle-orm`), `orm_too_old` (bump `drizzle-orm`), `kit_outdated` (bump `drizzle-kit` itself).
- `required_packages_error` — `meta.packages` lists the npm packages to install. Common for dialect drivers (`pg`, `mysql2`, `better-sqlite3`, `@libsql/client`, `mssql`).
- `unsupported_command_dialect_error` — the command isn't supported for `meta.dialect`. Use a different command or switch dialects. With `meta.option`, only that option is unsupported: postgresql rejects `ignore-conflicts` (use `generate --fix-conflicts`), and the other dialects reject `fix-conflicts`.
- `migrations_outdated_error` — the migrations folder under `meta.out` uses an older snapshot format. Run `drizzle-kit up` to migrate the folder forward.
- `check_error`: `meta.kind` discriminates. For `non_latest`, run `drizzle-kit up`. For `malformed`, see the case table in Check errors above. For `conflicts`, `meta.details` names the conflicting migrations; the `drizzle-migrations` skill covers how to resolve them.
- `command_output_error` with `meta.command: 'up'`: `up` converted nothing. `meta.kind` is `malformed` (a format 8 snapshot is broken, or a format 9 snapshot is broken while the folder has a snapshot to convert: restore `meta.snapshot` from git and run `up` again; a broken snapshot of format 4 to 7 gives `internal_error` instead), `invalid_snapshot` or `state_mismatch` (a drizzle-kit bug: keep the old files and report it; `state_mismatch` also names the first differing `meta.entity`).
- `invalid_hints` — discriminated by which keys are present in `meta`: `path` means a file read failed, `issues` means schema validation failed, `kind` + `from` together mean a `rename` hint's `from` tuple did not match any deleted entity. For schema-validation failures, fix the named issues; for a `from` mismatch, correct the tuple (the entity must be one the diff would otherwise delete).
- `unsupported_schema_change` — refer to the variant table above; each variant has a specific remediation path.
- `query_error` — the live DB threw on `meta.sql` with `meta.params`. Run the same query manually against the target DB to surface the underlying DBMS error; fix the schema or the data.
- `internal_error` — an unexpected exception escaped. `meta.message` carries the underlying error text. File an issue if reproducible; the SDK never throws for known failures, only for genuine bugs.

For `missing_hints` (status, not an error code) — see the `drizzle-hints` skill for the resolve-and-retry loop. For workflow context — when to use `generate` vs `push`, how migrations folders work — see `drizzle-migrations`.
