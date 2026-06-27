# Drizzle Kit SDK

The same JSON contract the `drizzle-kit` CLI emits is available as typed root-level exports for programmatic callers — agents, build tools, custom orchestrators. The CLI and SDK share one implementation; behavior, status discriminators, hint vocabulary, and error codes are identical to what is documented in [JSON_CONTRACT.md](./JSON_CONTRACT.md).

This document covers the public SDK surface. For the full machine-readable contract (status table, error code table), read [JSON_CONTRACT.md](./JSON_CONTRACT.md); the hint vocabulary is in [HINTS.md](./HINTS.md).

## Install

```bash
npm install drizzle-kit drizzle-orm
```

## Public surface

`--output` is a CLI-only concept. The SDK is implicitly JSON: `generate`, `push`, `check`, `pull`, `up`, and `exportSql` always resolve to the JSON envelope documented in [JSON_CONTRACT.md](./JSON_CONTRACT.md), and there is no caller-supplied output mode (the option types omit `output`). Callers narrow the result on its `status` discriminator rather than selecting a format.

Seven root-level values plus the per-function option-type aliases:

| Export | Kind | Purpose |
|---|---|---|
| `defineConfig` | function | Type-checked Drizzle config builder (CLI parity) |
| `generate` | async function | Programmatic equivalent of `drizzle-kit generate --output json` |
| `push` | async function | Programmatic equivalent of `drizzle-kit push --output json` |
| `check` | async function | Programmatic equivalent of `drizzle-kit check --output json` |
| `pull` | async function | Programmatic equivalent of `drizzle-kit pull --output json` |
| `up` | async function | Programmatic equivalent of `drizzle-kit up --output json` |
| `exportSql` | async function | Programmatic equivalent of `drizzle-kit export --output json` (named `exportSql` because `export` is a reserved word) |
| `Config` | type | Discriminated union of dialect configs |
| `GenerateOptions` | type | Input shape for `generate` |
| `PushOptions` | type | Input shape for `push` |
| `CheckOptions` | type | Input shape for `check` |
| `PullOptions` | type | Input shape for `pull` (includes `init?`) |
| `UpOptions` | type | Input shape for `up` |
| `ExportOptions` | type | Input shape for `exportSql` |

The response shape is not a named export: infer it from the call with `Awaited<ReturnType<typeof generate>>` / `Awaited<ReturnType<typeof push>>` / `Awaited<ReturnType<typeof check>>` / `Awaited<ReturnType<typeof pull>>` / `Awaited<ReturnType<typeof up>>` / `Awaited<ReturnType<typeof exportSql>>` (see the examples below). All other public-surface details (status discriminator values, error codes in [JSON_CONTRACT.md](./JSON_CONTRACT.md); hint kinds in [HINTS.md](./HINTS.md)) apply identically to SDK return values — they are not restated here.

```typescript
import { defineConfig, generate, push, check, pull, up, exportSql } from 'drizzle-kit';
import type { Config, GenerateOptions, PushOptions, CheckOptions, PullOptions, UpOptions, ExportOptions } from 'drizzle-kit';
```

## Minimal `generate` example

```typescript
import { generate } from 'drizzle-kit';

type GenerateResponse = Awaited<ReturnType<typeof generate>>;

const response: GenerateResponse = await generate({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});

if (response.status === 'ok') {
  // `migration_path` is present for dialects that write a migration file (e.g. postgresql, sqlite).
  if ('migration_path' in response) {
    console.log(`Generated migration at ${response.migration_path}`);
  } else {
    console.log('Generated migration');
  }
} else if (response.status === 'no_changes') {
  console.log('Schema in sync — no migration needed');
} else if (response.status === 'error') {
  console.error(`generate failed (${response.error.code})`);
  process.exit(1);
}
```

## Minimal `push` example

```typescript
import { push } from 'drizzle-kit';

type PushResponse = Awaited<ReturnType<typeof push>>;

const response: PushResponse = await push({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  url: process.env.DATABASE_URL!,
});

if (response.status === 'ok') {
  console.log(`Applied schema changes to the live ${response.dialect} database`);
} else if (response.status === 'no_changes') {
  console.log('Database already in sync');
} else if (response.status === 'error') {
  console.error(`push failed (${response.error.code})`);
  process.exit(1);
}
```

## Minimal `check` example

```typescript
import { check } from 'drizzle-kit';

type CheckResponse = Awaited<ReturnType<typeof check>>;

const response: CheckResponse = await check({
  dialect: 'postgresql',
  out: './drizzle',
});

if (response.status === 'ok') {
  console.log(`Migrations folder is valid (${response.dialect})`);
} else if (response.status === 'error') {
  console.error(`check failed (${response.error.code})`);
  process.exit(1);
}
```

## Minimal `pull` example

`pull` is ok-or-error only — it never returns `missing_hints` or `no_changes`.

```typescript
import { pull } from 'drizzle-kit';

type PullResponse = Awaited<ReturnType<typeof pull>>;

const response: PullResponse = await pull({
  dialect: 'postgresql',
  out: './drizzle',
});

if (response.status === 'ok') {
  console.log(`Wrote ${response.schemaPath} and ${response.snapshotPath}`);
  // `relationsPath` is present for every dialect except mssql; `migrationPath` only with `init: true`.
  if ('relationsPath' in response) {
    console.log(`Relations: ${response.relationsPath}`);
  }
} else if (response.status === 'error') {
  console.error(`pull failed (${response.error.code})`);
  process.exit(1);
}
```

## Minimal `up` example

```typescript
import { up } from 'drizzle-kit';

type UpResponse = Awaited<ReturnType<typeof up>>;

const response: UpResponse = await up({
  dialect: 'postgresql',
  out: './drizzle',
});

if (response.status === 'ok') {
  // `upgraded` lists rewritten snapshot paths; [] means everything was already current.
  console.log(`Upgraded ${response.upgraded.length} snapshot(s)`);
} else if (response.status === 'error') {
  console.error(`up failed (${response.error.code})`);
  process.exit(1);
}
```

## Minimal `export` example

```typescript
import { exportSql } from 'drizzle-kit';

type ExportResponse = Awaited<ReturnType<typeof exportSql>>;

const response: ExportResponse = await exportSql({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
});

if (response.status === 'ok') {
  // The full schema as individual SQL statements; join them yourself if you need one string.
  console.log(response.statements.join('\n'));
} else if (response.status === 'error') {
  console.error(`export failed (${response.error.code})`);
  process.exit(1);
}
```

## Handling `status: 'missing_hints'`

The most important agent-facing branch. When `generate` or `push` detects an ambiguity (a rename vs. drop+create, a destructive operation needing confirmation, a new schema declaration), it returns `status: 'missing_hints'` with an `unresolved` array describing each ambiguity. The caller picks a resolution for each item, builds a hint array, and re-invokes with the same options plus `hints`.

Hint vocabulary (which `kind` values are valid, what each `meta` shape contains) is documented in [HINTS.md](./HINTS.md) — this guide shows only the SDK call pattern.

```typescript
import { generate, type Hint } from 'drizzle-kit';

type GenerateResponse = Awaited<ReturnType<typeof generate>>;
type Unresolved = Extract<GenerateResponse, { status: 'missing_hints' }>['unresolved'][number];

async function generateWithHints(): Promise<GenerateResponse> {
  const baseOptions = {
    dialect: 'postgresql' as const,
    schema: './src/db/schema.ts',
    out: './drizzle',
  };

  // First call — no hints.
  const first: GenerateResponse = await generate(baseOptions);
  if (first.status !== 'missing_hints') return first;
  // first.status === 'missing_hints' from here on — `unresolved` is now narrowed.

  // Build resolutions. Each unresolved item dictates which `kind` and `meta` to send.
  // See HINTS.md "Catalog: kinds in unresolved items" for the full mapping.
  const hints = first.unresolved.map((item) => resolveHint(item));

  // Re-invoke with the raw hint array — the SDK takes `Hint[]` directly.
  return generate({
    ...baseOptions,
    hints,
  });
}

function resolveHint(item: Unresolved): Hint {
  // Application-specific resolution policy — agent prompts, user prompts, or static rules.
  throw new Error(`Provide a hint resolution for ${JSON.stringify(item)}`);
}
```

Notes:

- `hints` is a raw `Hint[]` (the CLI `--hints` flag is the JSON-string form of the same array). For long hint sets, use `hintsFile` with a path to a JSON file instead.
- A second `missing_hints` response after providing hints means the hint set was incomplete or invalid — see [JSON_CONTRACT.md Error codes](./JSON_CONTRACT.md#error-codes) for `invalid_hints` diagnostics.
- The same flow applies to `push` — substitute `push` and its inferred `Awaited<ReturnType<typeof push>>` response everywhere.

## Cross-references

- [JSON_CONTRACT.md Programmatic API](./JSON_CONTRACT.md#programmatic-api) — short SDK pitch in the v1-stable contract doc
- [JSON_CONTRACT.md Response statuses](./JSON_CONTRACT.md#response-statuses) — full status catalog
- [HINTS.md](./HINTS.md) — hint vocabulary and shapes
- [JSON_CONTRACT.md Error codes](./JSON_CONTRACT.md#error-codes) — error.code table
- [JSON_CONTRACT.md Recommended automation flow](./JSON_CONTRACT.md#recommended-automation-flow) — CLI-side equivalent of the SDK pattern above
