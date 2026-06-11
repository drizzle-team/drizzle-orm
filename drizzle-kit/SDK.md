# Drizzle Kit SDK

The same JSON contract the `drizzle-kit` CLI emits is available as typed root-level exports for programmatic callers — agents, build tools, custom orchestrators. The CLI and SDK share one implementation; behavior, status discriminators, hint vocabulary, and error codes are identical to what is documented in [JSON_CONTRACT.md](./JSON_CONTRACT.md).

This document covers the public SDK surface. For the full machine-readable contract (status table, error code table), read [JSON_CONTRACT.md](./JSON_CONTRACT.md); the hint vocabulary is in [HINTS.md](./HINTS.md).

## Install

```bash
npm install drizzle-kit drizzle-orm
```

## Public surface

`--output` is a CLI-only concept. The SDK is implicitly JSON: `generate` and `push` always resolve to the JSON envelope documented in [JSON_CONTRACT.md](./JSON_CONTRACT.md), and there is no caller-supplied output mode (the option types omit `output`). Callers narrow the result on its `status` discriminator rather than selecting a format.

Three root-level values plus three type aliases:

| Export | Kind | Purpose |
|---|---|---|
| `defineConfig` | function | Type-checked Drizzle config builder (CLI parity) |
| `generate` | async function | Programmatic equivalent of `drizzle-kit generate --output json` |
| `push` | async function | Programmatic equivalent of `drizzle-kit push --output json` |
| `Config` | type | Discriminated union of dialect configs |
| `GenerateOptions` | type | Input shape for `generate` |
| `PushOptions` | type | Input shape for `push` |

The response shape is not a named export: infer it from the call with `Awaited<ReturnType<typeof generate>>` / `Awaited<ReturnType<typeof push>>` (see the examples below). All other public-surface details (status discriminator values, error codes in [JSON_CONTRACT.md](./JSON_CONTRACT.md); hint kinds in [HINTS.md](./HINTS.md)) apply identically to SDK return values — they are not restated here.

```typescript
import { defineConfig, generate, push } from 'drizzle-kit';
import type { Config, GenerateOptions, PushOptions } from 'drizzle-kit';
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
