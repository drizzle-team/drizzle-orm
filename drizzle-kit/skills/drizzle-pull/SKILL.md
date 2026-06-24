---
name: drizzle-pull
description: Introspect an existing database into a Drizzle schema — the reverse of generate and push, which drive a database from a schema. Load whenever the task is to generate a Drizzle schema from a live database, reverse-engineer or import an existing database, or decode the result manifest or a connect/introspect failure from a pull.
metadata:
  version: "1.0.0"
---

# Drizzle pull

If the `drizzle` skill has not been loaded yet this session, load it first — it carries the staleness check and the MCP-vs-CLI surface-selection rule that govern every drizzle-kit invocation.

Pull introspects an existing database and writes a Drizzle schema from it: it connects, reads the live DDL, and emits `schema.ts`, a `relations.ts` (for the dialects that have one), and a snapshot under the configured `out` dir. It is the inverse of `generate` / `push` — those start from a schema and drive the database; pull starts from the database and writes the schema. The `drizzle-migrations` skill covers where pull sits in the overall workflow. Output format and interactivity are separate axes the same way they are for the other verbs — the `drizzle-output-modes` skill covers the text-vs-json choice — and `drizzle-responses-and-errors` decodes the envelope shapes below.

## CLI form

```bash
drizzle-kit pull --output json [--config drizzle.config.ts] [--dialect <d>] [--out <dir>] [--breakpoints] [--casing camel|preserve] [--init]
```

Flag surface:

- `--config` — path to `drizzle.config.ts` (default: `drizzle.config.ts` at CWD). Pull reads `dbCredentials` from the config; there is no CLI flag for the credentials object as a whole.
- `--dialect`, `--out` — override the corresponding `defineConfig` fields. `--out` is where `schema.ts` / `relations.ts` / the snapshot are written.
- `--url` / `--host` / `--port` / `--user` / `--password` / `--database` / `--ssl` / `--auth-token` — direct connection overrides for the corresponding `dbCredentials` fields. Most projects set these in the config file instead.
- `--breakpoints` — emit statement-breakpoint markers in any generated migration SQL.
- `--casing camel|preserve` — how introspected identifiers are cased in the emitted schema (`camel` camel-cases columns; `preserve` keeps the database spelling).
- `--output json` — switches stdout to one JSON line carrying the envelope and is always non-interactive. Use it for agent / CI / scripted contexts. Under the default `--output text` pull prints human-readable progress and the result.
- `--init` — also run the initial migration against the live database. This is a destructive write (see the `--init` note below); it adds `migrationPath` to the ok manifest.

Minimal example — `drizzle.config.ts` carries the credentials, the CLI invocation is just the verb:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

```bash
drizzle-kit pull --output json --config drizzle.config.ts
# → {"status":"ok","dialect":"postgresql","schemaPath":"drizzle/schema.ts","relationsPath":"drizzle/relations.ts","snapshotPath":"drizzle/meta/0000_snapshot.json"}
```

The process exits with the code that matches `status` (`0` for ok, `1` for error). Agents read both stdout (the envelope) and the exit code.

## SDK form

```typescript
import { pull } from 'drizzle-kit';

const response = await pull({
  dialect: 'postgresql',
  out: './drizzle',
  url: process.env.DATABASE_URL!,
});

if (response.status === 'ok') {
  // introspection succeeded; the manifest names the written files:
  //   response.schemaPath    — always present
  //   response.snapshotPath  — always present
  //   response.relationsPath — present except mssql (no relations file)
  //   response.migrationPath — present only when called with init: true
} else {
  // response.status === 'error'
  // response.error.code identifies the failure, e.g. database_driver_error
  // (connect/introspect/init failures are credential-redacted) — decode it
  // with the drizzle-responses-and-errors skill
}
```

`pull` is a real root SDK function. It always runs in JSON mode internally — no `--output json` flag needed at the call site — and returns the same envelope the CLI prints. In SDK form the credential fields are passed flat on the call (`url`, or the broken-out `host` / `port` / `user` / `password` / `database` set); pass `init: true` to also run the initial migration. The status is `ok` or `error` only — there is no `no_changes` branch and no `missing_hints` branch (see Contract below).

## Response shape

The `'ok'` envelope is a paths-manifest — it names the files pull wrote, not the introspected DDL:

```jsonc
// postgres / mysql / sqlite / turso / cockroach / singlestore — relationsPath present
{ "status": "ok", "dialect": "postgresql", "schemaPath": "drizzle/schema.ts", "relationsPath": "drizzle/relations.ts", "snapshotPath": "drizzle/meta/0000_snapshot.json" }

// mssql — relationsPath omitted (no relations file is generated)
{ "status": "ok", "dialect": "mssql", "schemaPath": "drizzle/schema.ts", "snapshotPath": "drizzle/meta/0000_snapshot.json" }

// with init: true — an initial migration was also written, so migrationPath appears
{ "status": "ok", "dialect": "postgresql", "schemaPath": "drizzle/schema.ts", "relationsPath": "drizzle/relations.ts", "snapshotPath": "drizzle/meta/0000_snapshot.json", "migrationPath": "drizzle/0000_init/migration.sql" }
```

So the manifest is `{ schemaPath, snapshotPath, relationsPath?, migrationPath? }`: `schemaPath` and `snapshotPath` are always present; `relationsPath?` is optional and omitted for mssql; `migrationPath?` is optional and present only with `--init`. The envelope carries no inline DDL array.

The `'error'` envelope, when the driver cannot connect or introspection fails:

```json
{ "status": "error", "error": { "code": "database_driver_error", "database": "postgresql", "packages": ["pg", "postgres"], "note": "<optional connection hint>" } }
```

`database_driver_error` carries only `database`, `packages`, and an optional `note` — the connection string, sql, and params are deliberately kept out of the envelope, so no credential substring ever reaches stdout. The `drizzle-responses-and-errors` skill decodes this and the other error codes. Example payloads here use placeholder paths and dialects only — never a real connection string, url, or password.

## Contract

Pull is ok/error only. It never emits `missing_hints`: it introspects against an empty starting DDL, constructs no hints handler, and exposes no consent surface — there are no ambiguous renames or destructive-change prompts to resolve. The only outcomes are `ok` (the manifest is returned) or a thrown typed error surfaced as the `error` envelope.

## --init

`--init` (CLI) / `init: true` (SDK) runs the initial migration against the live database in addition to writing the schema. That is a destructive write — it executes DDL against the connected database, not just disk — and on success it adds `migrationPath` to the ok manifest. The MCP `pull` tool surfaces this `init` escalation as a per-call destructive signal on its result; the `drizzle-responses-and-errors` skill carries the canonical shape of that signal.
