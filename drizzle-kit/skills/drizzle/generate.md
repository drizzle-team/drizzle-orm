# Drizzle generate

The CLI flag `--output json` and the SDK `generate(...)` function emit the same discriminated-union envelope, and the envelope (not the stdout text) is what the agent decodes. Output format and interactivity are separate axes — see [output-modes.md](output-modes.md). This skill assumes a working Drizzle schema and a `drizzle.config.ts` already exist; it does not author schemas.

## CLI form

```bash
drizzle-kit generate --output json [--config drizzle.config.ts] [--dialect <d>] [--schema <path>] [--out <dir>] [--explain] [--hints '<json>' | --hints-file ./hints.json]
```

Flag surface:

- `--config` — path to `drizzle.config.ts` (default: `drizzle.config.ts` at CWD).
- `--dialect`, `--schema`, `--out` — override the corresponding `defineConfig` fields.
- `--output json` — switches stdout to one JSON line carrying the envelope and is always non-interactive. Use it for agent / CI / scripted contexts. Under the default `--output text` the CLI prompts only on a TTY and otherwise prints the missing-decisions report (exit 2).
- `--explain` — dry-run mode. Returns planned SQL statements and computed hints instead of writing a migration file. With `--fix-conflicts`, it deletes nothing, and the result also has `fix`: the folders that the fix would delete. It cannot be used with `--custom`, and `generate` rejects that pair with `unsupported_command_dialect_error`.
- `--fix-conflicts` — postgresql only. When branches in the migrations folder conflict, deletes the conflicting migrations and their children, then generates one new migration. Over MCP, call the `fix_conflicts` tool instead. [migrations.md](migrations.md) explains when that is safe.
- `--hints` — inline JSON array of hint resolutions (see [hints.md](hints.md)).
- `--hints-file` — same payload as `--hints`, read from a JSON file. Use for long hint sets.

Minimal example:

```bash
drizzle-kit generate --output json --config drizzle.config.ts
# → {"status":"ok","dialect":"postgresql","migration_path":"drizzle/20260427153000_name/migration.sql"}
```

The process exits with the code that matches `status` (see Response envelope below). Agents read both stdout (the envelope) and the exit code.

## SDK form

```typescript
import { generate } from 'drizzle-kit';

const response = await generate({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});

if (response.status === 'ok') {
  // response.migration_path is the path to the new SQL file
} else if (response.status === 'no_changes') {
  // schema matches the most recent migration — nothing was written
} else if (response.status === 'missing_hints') {
  // response.unresolved lists ambiguities — see hints.md
} else if (response.status === 'error') {
  // response.error.code identifies the failure — see responses-and-errors.md
}
```

The SDK is the public-surface entry point. It always runs in JSON mode internally — no `--output json` flag needed at the call site — and returns the same envelope the CLI prints. Narrow on `response.status` to extract typed branches:

- `'ok'` → `response.dialect`, `response.migration_path` (or `response.statements`, `response.hints` in explain mode).
- `'no_changes'` → `response.dialect`.
- `'missing_hints'` → `response.unresolved` (array of items).
- `'error'` → `response.error.code` plus per-code metadata.

The SDK does not throw on user-level failures — every outcome flows through the envelope. Unexpected runtime exceptions are wrapped as `status: 'error'` with `code: 'internal_error'`.

## Response shape

`'ok'` (write mode) carries `{ status, dialect, migration_path }`. When `--fix-conflicts` deleted migrations, `'ok'` and `'no_changes'` also carry `deleted_migrations` and `deleted_custom_migrations?`; `'ok'` (explain mode) carries `{ status, dialect, statements, hints }`. With `--fix-conflicts` and a conflict in the folder, the explain `'ok'` and `'no_changes'` also carry `fix: { migrations, customMigrations }`, the folders that the fix would delete. `'no_changes'`, `'missing_hints'`, and `'error'` are shared across operations. Full envelope shapes, exit-code mapping, and per-code error metadata live in [responses-and-errors.md](responses-and-errors.md)'s response-envelope section.

`'missing_hints'` (exit 2) means the diff is ambiguous or unsafe — the resolution loop lives in [hints.md](hints.md). The most common error codes for `generate` are `config_validation_error`, `config_file_not_found_error`, `schema_files_not_found_error`, `orm_version_error`, `invalid_hints`, `unsupported_schema_change`, `internal_error`. Before it diffs, `generate` checks the migrations folder the same way `check` does, so it can also return `check_error` for a broken folder or for branches that conflict. [migrations.md](migrations.md) explains the migrations folder, merges of branches, and the fixes.

## Dialect notes

Per-dialect quirks (postgresql, mysql, sqlite, mssql, cockroach, singlestore) — the same diff engine and dialect surface drives both `generate` and `push`, so the notes are shared. See [migrations.md](migrations.md)'s dialect-notes section.

## Examples

```bash
# Happy path
drizzle-kit generate --output json --config drizzle.config.ts
# → {"status":"ok","dialect":"postgresql","migration_path":"drizzle/20260427153000_init/migration.sql"}

# Idempotent re-run on an up-to-date schema
drizzle-kit generate --output json --config drizzle.config.ts
# → {"status":"no_changes","dialect":"postgresql"}

# Ambiguous diff — caller must supply hints and retry
drizzle-kit generate --output json --config drizzle.config.ts
# → {"status":"missing_hints","unresolved":[{"type":"rename_or_create","kind":"column","entity":["public","users","email_v2"]}]}
# (resolution loop: see hints.md)

# Hard error
drizzle-kit generate --output json --config missing.ts
# → {"status":"error","error":{"code":"config_file_not_found_error","path":"missing.ts"}}
```

SDK equivalent of the happy path:

```typescript
import { generate } from 'drizzle-kit';

const r = await generate({ dialect: 'postgresql', schema: './src/db/schema.ts', out: './drizzle' });
if (r.status === 'ok') console.log(r.migration_path);
```
