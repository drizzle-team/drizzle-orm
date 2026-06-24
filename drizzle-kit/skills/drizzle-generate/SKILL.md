---
name: drizzle-generate
description: Create a new drizzle migration SQL file by diffing the schema against the latest snapshot. Load before running `drizzle-kit generate` or calling the `generate(...)` SDK, after any Drizzle schema edit when the next step is producing migration SQL, or when the task is to generate, scaffold, or make a new migration.
metadata:
  version: "1.0.0"
---

# Drizzle generate

If the `drizzle` skill has not been loaded yet this session, load it first — it carries the staleness check and the MCP-vs-CLI surface-selection rule that govern every drizzle-kit invocation.

The CLI flag `--output json` and the SDK `generate(...)` function emit the same discriminated-union envelope, and the envelope (not the stdout text) is what the agent decodes. Output format and interactivity are separate axes: `--output json` selects the machine-readable envelope and is always non-interactive, so pass it whenever an agent calls the CLI. Under the default `--output text` the CLI prompts only when stdin is a TTY; in a non-TTY it prints the missing-decisions report and exits 2 (it never hangs prompting). See the `drizzle-output-modes` skill for the two modes and the interactivity rule. The SDK runs in JSON mode internally with no flag needed at the call site. This skill assumes a working Drizzle schema and a `drizzle.config.ts` already exist; it does not author schemas.

## CLI form

```bash
drizzle-kit generate --output json [--config drizzle.config.ts] [--dialect <d>] [--schema <path>] [--out <dir>] [--explain] [--hints '<json>' | --hints-file ./hints.json]
```

Flag surface:

- `--config` — path to `drizzle.config.ts` (default: `drizzle.config.ts` at CWD).
- `--dialect`, `--schema`, `--out` — override the corresponding `defineConfig` fields.
- `--output json` — switches stdout to one JSON line carrying the envelope and is always non-interactive. Use it for agent / CI / scripted contexts. Under the default `--output text` the CLI prompts only on a TTY and otherwise prints the missing-decisions report (exit 2).
- `--explain` — dry-run mode. Returns planned SQL statements and computed hints instead of writing a migration file.
- `--hints` — inline JSON array of hint resolutions (see the `drizzle-hints` skill).
- `--hints-file` — same payload as `--hints`, read from a JSON file. Use for long hint sets.

Minimal example:

```bash
drizzle-kit generate --output json --config drizzle.config.ts
# → {"status":"ok","dialect":"postgresql","migration_path":"drizzle/0001_name/migration.sql"}
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
  // response.unresolved lists ambiguities — see the drizzle-hints skill
} else if (response.status === 'error') {
  // response.error.code identifies the failure — see drizzle-responses-and-errors
}
```

The SDK is the public-surface entry point. It always runs in JSON mode internally — no `--output json` flag needed at the call site — and returns the same envelope the CLI prints. Narrow on `response.status` to extract typed branches:

- `'ok'` → `response.dialect`, `response.migration_path` (or `response.statements`, `response.hints` in explain mode).
- `'no_changes'` → `response.dialect`.
- `'missing_hints'` → `response.unresolved` (array of items).
- `'error'` → `response.error.code` plus per-code metadata.

The SDK does not throw on user-level failures — every outcome flows through the envelope. Unexpected runtime exceptions are wrapped as `status: 'error'` with `code: 'internal_error'`.

## Response shape

`'ok'` (write mode) carries `{ status, dialect, migration_path }`; `'ok'` (explain mode) carries `{ status, dialect, statements, hints }`. `'no_changes'`, `'missing_hints'`, and `'error'` are shared across operations. Full envelope shapes, exit-code mapping, and per-code error metadata live in the `drizzle-responses-and-errors` skill's response-envelope section.

`'missing_hints'` (exit 2) means the diff is ambiguous or unsafe — the resolution loop lives in the `drizzle-hints` skill. The most common error codes for `generate` are `config_validation_error`, `config_file_not_found_error`, `schema_files_not_found_error`, `orm_version_error`, `invalid_hints`, `unsupported_schema_change`, `internal_error`.

## Dialect notes

Per-dialect quirks (postgresql, mysql, sqlite, mssql, cockroach, singlestore) — the same diff engine and dialect surface drives both `generate` and `push`, so the notes are shared. See the `drizzle-migrations` skill's dialect-notes section.

## Examples

```bash
# Happy path
drizzle-kit generate --output json --config drizzle.config.ts
# → {"status":"ok","dialect":"postgresql","migration_path":"drizzle/0001_init/migration.sql"}

# Idempotent re-run on an up-to-date schema
drizzle-kit generate --output json --config drizzle.config.ts
# → {"status":"no_changes","dialect":"postgresql"}

# Ambiguous diff — caller must supply hints and retry
drizzle-kit generate --output json --config drizzle.config.ts
# → {"status":"missing_hints","unresolved":[{"type":"rename_or_create","kind":"column","entity":["public","users","email_v2"]}]}
# (resolution loop: see the drizzle-hints skill)

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
