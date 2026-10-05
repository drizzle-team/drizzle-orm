---
name: drizzle-migrations
description: Orient to the drizzle-kit migration workflow — `defineConfig`, `generate` vs `push`, the migrations folder and its snapshots, and per-dialect quirks across postgresql, mysql, sqlite, mssql, cockroach, and singlestore. Load whenever drizzle migrations are being set up or modified, `drizzle.config.ts` is being read or edited, the generate-vs-push choice is being made, any Drizzle schema file has just been edited, migrations from several git branches meet in one migrations folder, a drizzle-kit command reports a broken migrations folder or branch conflicts, or a command asks to run `drizzle-kit up`.
metadata:
  version: "1.0.0"
---

# Drizzle migrations

If the `drizzle` skill has not been loaded yet this session, load it first — it carries the staleness check and the MCP-vs-CLI surface-selection rule that govern every drizzle-kit invocation.

Entry-point skill for the drizzle-kit migration workflow. Four responsibilities live here: the `defineConfig` reference, the `generate` vs `push` comparison, the per-dialect quirks catalog, and the guide to the migrations folder (snapshots, branches, errors and `drizzle-kit up`). Invocation details (CLI form, SDK form, response shapes) live in the operation skills.

## Configuration

`defineConfig` is the type-safe entry point. The same object shape is used by both the CLI (loaded automatically from `drizzle.config.ts`) and the SDK (passed inline to `generate` / `push`).

Required fields:

- **`dialect`** — one of `postgresql`, `mysql`, `sqlite`, `turso`, `mssql`, `cockroach`, `singlestore`. For Turso / libsql set `dialect: 'turso'` (with the `@libsql/client` or `@tursodatabase/serverless` driver) — it is a first-class dialect value, not a `sqlite` alias.
- **`schema`** — path or path-glob to the schema file(s). Examples: `'./src/db/schema.ts'`, `['./src/db/**/*.ts']`.
- **`out`** — directory where `generate` writes `.sql` migration files. Conventional: `'./drizzle'`.
- **`dbCredentials`** — per-dialect credential shape. Required for `push` (which connects to a live database) and for the introspect side of some `generate` codepaths. Either a `url` field or a structured object (`{ host, port, user, password, database }`-style); the exact shape varies by dialect. Use environment variables — never hard-code secrets.

Minimal example (postgresql):

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## Generate vs push

- **`generate`** — file-based. Computes the diff, writes a `.sql` file under `out`, and exits. The agent (or a human, or CI) reviews the SQL and applies it later via the driver's migrate runner. Safest for production. Pairs naturally with code-review workflows. Load the `drizzle-generate` skill for invocation details.
- **`push`** — direct application. Computes the diff and executes the DDL against the live database immediately. No migration file. Fastest feedback loop during development. In production, destructive changes (dropping a non-empty entity, changing a column's SQL type, or recreating a SQLite table to add a `NOT NULL` column) return `status: 'missing_hints'` and require explicit approval via the `drizzle-hints` resolution loop before they apply. Load the `drizzle-push` skill for invocation details.

Choose `generate` for production releases and review workflows; choose `push` for rapid local iteration. Both operations share one JSON envelope (decoded by the `drizzle-responses-and-errors` skill) and one hint vocabulary.

To go the other direction — introspect an existing database into a Drizzle schema instead of driving the database from a schema — see the `drizzle-pull` skill.

## Dialect notes

The diff engine and dialect surface are shared by `generate` and `push`, so the per-dialect quirks below apply uniformly to both operations.

- `postgresql` — full surface: schemas, enums, sequences, views, policies, roles, privileges. `confirm_data_loss` on `view` fires only for materialized views (regular views drop silently). `serial` / `bigserial` columns auto-create their sequences with no `confirm_data_loss` prompt.
- `mysql` — `confirm_data_loss` with `reason: 'type_change'` fires on any `ALTER COLUMN` whose dialect-native type would change; `reason_details` carries `{ from, to }` with dialect-native spellings. `unsupported_schema_change/drop_pk_dependency` blocks `DROP PRIMARY KEY` when foreign keys reference the dropped columns and no covering UNIQUE exists. `unsupported_schema_change/fk_target_not_unique` blocks `CREATE FOREIGN KEY` when the referenced columns are not unique. No `schema` / `enum` / `sequence` / `policy` / `role` / `privilege` kinds.
- `sqlite` — table-rebuild semantics: most ALTERs emit `recreate_table` statements (copy-into-new-table, swap, drop-old). `confirm_data_loss/add_not_null` issues a `DELETE` to truncate nulls before the rebuild — approve only when row loss is acceptable. No `primary_key` / `add_unique` `confirm_data_loss` kinds. `turso` (libsql) shares the sqlite handler over the libsql driver.
- `mssql` — `unsupported_schema_change/rename_blocked_by_check_constraint` fires when `sp_rename` would fail because the column is referenced by a `CHECK` constraint; the agent must drop the constraint, rename, then recreate. `unsupported_schema_change/rename_schema_unsupported` is unconditional — MSSQL has no schema rename. `schema` kind is available for create / drop.
- `cockroach` — postgres-family; surface largely mirrors `postgresql`. Materialized-view drops are the only `confirm_data_loss/view` trigger. Distributed-schema notes surface in `--explain` mode.
- `singlestore` — inherits the MySQL handler shape. Same `unsupported_schema_change` variants apply (`drop_pk_dependency`, `fk_target_not_unique`). No `schema` / `enum` / `sequence` / `policy` / `role` / `privilege` kinds.

## The migrations folder

`generate` writes each migration into its own folder under `out`:

```text
drizzle/
  20260101120001_init/
    migration.sql
    snapshot.json
  20260101120002_add_email/
    migration.sql
    snapshot.json
```

The folder name starts with the UTC time (`YYYYMMDDHHMMSS`) and ends with the migration name. `migration.sql` is the SQL that the migrator runs. `snapshot.json` is what drizzle-kit reads to compute the next migration and to check branches. The drizzle-orm migrator reads only `migration.sql`, and it runs the folders in folder-name order.

Every snapshot has an `id` and a `prevIds` list with the ids of its parent snapshots. Most snapshots have one parent. A merge snapshot has several.

Do not edit `snapshot.json` files by hand. To change a migration that no database has run yet, delete its folder and run `generate` again.

### Base and diff snapshots (postgresql)

For postgresql, drizzle-kit writes snapshot format 9:

- The first migration gets a **base snapshot**. It holds the full schema.
- Every later migration gets a **diff snapshot**. It holds only what that migration changed, as a list of deltas. A delta creates, drops, alters, renames or relocates one entity. A relocate is a move that follows another entity's rename, for example a column that moves with its renamed table.

drizzle-kit rebuilds the schema of any migration by starting from the base snapshot and applying the deltas of the later snapshots in order. So each migration's `snapshot.json` is small, and a reviewer can read it next to `migration.sql` to see what changed. It also means that every snapshot needs all the snapshots before it: keep every migration folder, and in particular keep the first one.

Every snapshot also stores the **statements** of its own migration in `statements`, in the order of the SQL. A statement is one schema change with its meaning, for example `{ "type": "rename_column", ... }`. The `check` command compares the stored statements of two branches, so its result for an old migration does not change with a newer drizzle-kit. Do not edit `statements` by hand: a snapshot without the field, or with an unknown statement `type`, is malformed.

`generate --custom` writes a `migration.sql` that holds only a comment, for hand-written SQL, and a diff snapshot with no deltas and no statements. drizzle-kit does not read the SQL of a custom migration, so `check` does not see what it changes.

mysql, sqlite, turso, mssql, singlestore and cockroach still write the full schema into every snapshot.

### Branches and merges

When two git branches each add migrations and then come together, the migrations folder has several leaves: the newest migration of each branch. `generate`, `check` and `migrate` first check that the branches do not conflict. For postgresql, the check compares every stored statement of one branch with every stored statement of the other, so a change that a branch makes and later reverts still counts.

- If the branches do not conflict, the next `generate` with a schema change writes a **merge migration**. Its `prevIds` lists the newest migration of every branch. For postgresql, the one with the newest folder name comes first, the merge snapshot holds only the deltas of the new change, and `migration.sql` holds only the new change, because each branch's SQL already runs from that branch's own folders. If the schema has no new change, `generate` writes nothing, and the branches stay open until the next migration. Open branches do not stop `migrate`.
- If the branches conflict, `check`, `generate` and `migrate` stop with the `check_error` code and `kind: "conflicts"`. The report names the conflicting migrations.
- For postgresql, the report also lists the folders that `drizzle-kit generate --fix-conflicts` deletes: the migrations that hold the conflicting statements that check reports, on both branches, and all their children. Check reports one conflict for each pair of branches, so the fix checks the rest again and repeats until no conflict is left. The fix then generates one new migration from the schema. Use it only when no shared database ran the deleted migrations. Every database that ran a deleted migration must be reset. The report warns when the fix would delete a custom migration, because the SQL of a custom migration is lost. In interactive mode, `generate` offers the same fix. postgresql rejects `--ignore-conflicts`.
- For the other dialects, if one branch's migrations have not run on any shared database yet, delete that branch's migration folders, take the other branch, and run `generate` again. Otherwise, pass `--ignore-conflicts` to `generate`, and the merge migration is written anyway.

### Folder order

A migration folder must sort after the folders of its parents, because the migrator runs the folders in name order. For postgresql, `generate` takes care of this: if the computer clock is behind the newest parent, the new folder gets that parent's time plus one second. The other dialects always name the folder from the computer clock. Renaming migration folders by hand can break the rule.

### Errors in the migrations folder

For postgresql, `generate`, `check`, `migrate` and `pull` check the history of the migrations folder before they do anything else. `up` checks only a folder that it converts. Each problem below stops the command with the `check_error` code. The `kind` is `"malformed"`, and for a wrong folder order it is `"order"`. The `drizzle-responses-and-errors` skill decodes the envelope.

- **A snapshot file cannot be read.** The file is not valid JSON, or it has no `id` or no `prevIds` array. Only `snapshot` is set. This happens, for example, when a git merge left conflict markers in `snapshot.json`. Restore the file from git (keep the version from one of the merged git branches), or fix the JSON by hand.
- **A parent is missing.** `parentId` is set to the id of the missing parent, and `snapshot` is the migration that needs it. A migration folder in the middle of the history is gone. Restore that folder from git. If it cannot be restored, delete the migration named in `snapshot` and every later migration, then run `generate` again.
- **The base snapshot is missing.** Only `snapshot` is set. The first migration folder is gone. Restore it from git, or delete the named migration and every later one and run `generate` again.
- **A folder sorts before its parent.** The `kind` is `"order"`, and `parentSnapshot` is set to the parent's `snapshot.json`. Rename the folder named in `snapshot` so that it sorts after the parent folder.

Deleting migrations is safe for the history in these cases:

- The newest migration. The next `generate` redoes it from the migration before it.
- A migration together with every later migration.
- A merge migration. Its branches open again, and the next `generate` merges them again.

Only delete a migration that no database has run yet. The migrator does not undo SQL that already ran.

### Upgrading with `drizzle-kit up`

Run `drizzle-kit up` when a command stops with `migrations_outdated_error`, or with `check_error` and `kind: "non_latest"`, or prints "please run drizzle-kit up". This happens with folders that an older drizzle-kit wrote.

`up` changes only the files in the migrations folder:

- If the folder still has `meta/_journal.json` and `meta/<n>_snapshot.json` files, `up` moves every migration into its own folder with `migration.sql` and `snapshot.json`.
- For postgresql, `up` converts every older snapshot to format 9. The first snapshot becomes a base snapshot, and every later one becomes a diff snapshot. Renames that the old snapshots recorded become rename deltas. `up` also computes the statements of each converted migration and stores them. If an old snapshot stores another generated name for a constraint than the rebuilt schema has, `up` adds a drop and a create of that constraint to keep the stored name. `up` does not change the SQL of any migration.

For postgresql, `up` rebuilds every schema from the new files and compares it with the old file before it rewrites any snapshot. The comparison ignores the name of a primary key that has the Postgres default name `<table>_pkey`: after a table rename, Postgres keeps the old name, and the rebuilt schema keeps it too. If one schema differs, `up` rewrites no snapshot and stops with the `command_output_error` code and `kind: "state_mismatch"`, which names the snapshot and the entity. That is a drizzle-kit bug: keep the old files and report it. `up` moves and writes files only after every check passed, so a failure leaves the folder as it was. A folder that is already current stays as it is, and `upgraded` is then `[]`.

For postgresql, `up` refuses a folder whose history it cannot convert, with the `command_output_error` code and `kind: "history"`. With `parentId`, a migration was deleted in the middle of the history: restore it from git, or delete the migration named in `snapshot` and every later migration, run `up`, and generate them again. With `entry`, that entry of `meta/_journal.json` has no SQL file: restore the file named in `sql`. `up` writes no backup, so commit the folder before you run it, then review and commit the result.

## Collapsing snapshot diffs in code review

For postgresql, only the first snapshot holds the full schema, and each later `snapshot.json` lists only what its migration changed, so reviewers can read it next to `migration.sql`. The other dialects write the full schema into every `snapshot.json`, and those files grow with the schema. To keep them out of code-review noise, mark them in `.gitattributes`. This is code-review hygiene, not a drizzle-kit command.

Target only the snapshot glob `drizzle/*/snapshot.json`. It mirrors the configured `out` dir: the default is `drizzle/`, so an `out: 'migrations'` project uses `migrations/*/snapshot.json` instead. Adjust the leading directory to match `out`. Do not broaden the glob to the whole folder, because `migration.sql` is what reviewers need to read.

Per platform:

- **GitHub** — mark the snapshots as generated so Linguist collapses them by default (reviewers can still expand):

  ```gitattributes
  drizzle/*/snapshot.json linguist-generated=true
  ```

  Linguist detects many generated files by filename and content, but `snapshot.json` is not on that list, so the explicit attribute is required.

- **GitLab** — collapse via the `gitlab-generated` attribute (GA on 16.11+, no feature flag):

  ```gitattributes
  drizzle/*/snapshot.json gitlab-generated
  ```

- **Bitbucket and Gerrit** — neither has a native generated-file collapse mechanism, and neither honors `linguist-generated` or `gitlab-generated`; there is no path-based auto-collapse in their web review UIs. The closest git-native lever is the `-diff` attribute:

  ```gitattributes
  drizzle/*/snapshot.json -diff
  ```

  The `-diff` attribute tells git to treat the path as non-text, so `git diff` prints "Binary files differ" instead of the textual hunk (and GitHub and GitLab show it as a binary diff too). It does not collapse the file in the Bitbucket or Gerrit web review UIs: the snapshot still appears in the changed-files list, without a readable diff. It also removes a diff that is useful locally, because the snapshot is JSON text. Use `-diff` only when that cost is acceptable on those platforms.
