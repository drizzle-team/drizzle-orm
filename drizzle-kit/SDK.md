# Drizzle Kit SDK

The same JSON contract the `drizzle-kit` CLI emits is available as typed root-level exports for programmatic callers — agents, build tools, custom orchestrators. The CLI and SDK share one implementation; behavior, status discriminators, hint vocabulary, and error codes are identical to what is documented in [JSON_CONTRACT.md](./JSON_CONTRACT.md).

This document covers the public SDK surface. For the full machine-readable contract (status table, hint catalog, error code table), read [JSON_CONTRACT.md](./JSON_CONTRACT.md).

## Install

```bash
npm install drizzle-kit drizzle-orm
```

## Public surface

Three root-level values plus six type aliases:

| Export | Kind | Purpose |
|---|---|---|
| `defineConfig` | function | Type-checked Drizzle config builder (CLI parity) |
| `generate` | async function | Programmatic equivalent of `drizzle-kit generate --json` |
| `push` | async function | Programmatic equivalent of `drizzle-kit push --json` |
| `Config` | type | Discriminated union of dialect configs |
| `GenerateOptions` | type | Input shape for `generate` |
| `PushOptions` | type | Input shape for `push` |
| `GenerateJsonResponse` | type | Discriminated response union for `generate` |
| `PushJsonResponse` | type | Discriminated response union for `push` |
| `MissingHintsResponse` | type | The `status: 'missing_hints'` branch of both responses |

All other public-surface details (status discriminator values, hint kinds, error codes) live in [JSON_CONTRACT.md](./JSON_CONTRACT.md) and apply identically to SDK return values — they are not restated here.

```typescript
import { defineConfig, generate, push } from 'drizzle-kit';
import type {
  Config,
  GenerateJsonResponse,
  GenerateOptions,
  MissingHintsResponse,
  PushJsonResponse,
  PushOptions,
} from 'drizzle-kit';
```

## Minimal `generate` example

```typescript
import { generate } from 'drizzle-kit';
import type { GenerateJsonResponse } from 'drizzle-kit';

const response: GenerateJsonResponse = await generate({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});

if (response.status === 'ok') {
  console.log(`Generated migration at ${response.migration_path}`);
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
import type { PushJsonResponse } from 'drizzle-kit';

const response: PushJsonResponse = await push({
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

Hint vocabulary (which `kind` values are valid, what each `meta` shape contains) is documented in [JSON_CONTRACT.md Hints flow](./JSON_CONTRACT.md#hints-flow) — this guide shows only the SDK call pattern.

```typescript
import { generate } from 'drizzle-kit';
import type { GenerateJsonResponse, MissingHintsResponse } from 'drizzle-kit';

async function generateWithHints(): Promise<GenerateJsonResponse> {
  const baseOptions = {
    dialect: 'postgresql' as const,
    schema: './src/db/schema.ts',
    out: './drizzle',
  };

  // First call — no hints.
  const first: GenerateJsonResponse = await generate(baseOptions);
  if (first.status !== 'missing_hints') return first;
  // first.status === 'missing_hints' from here on — `unresolved` is now narrowed.

  // Build resolutions. Each unresolved item dictates which `kind` and `meta` to send.
  // See JSON_CONTRACT.md "Catalog: kinds in unresolved items" for the full mapping.
  const hints = first.unresolved.map((item) => resolveHint(item));

  // Re-invoke with hints serialized as JSON string (matches CLI --hints flag).
  return generate({
    ...baseOptions,
    hints: JSON.stringify(hints),
  });
}

function resolveHint(item: MissingHintsResponse['unresolved'][number]): unknown {
  // Application-specific resolution policy — agent prompts, user prompts, or static rules.
  // The returned object must match the `Hint` shape documented in JSON_CONTRACT.md.
  throw new Error(`Provide a hint resolution for ${JSON.stringify(item)}`);
}
```

Notes:

- `hints` is passed as a JSON string (mirrors `--hints` on the CLI). For long hint sets, use `hintsFile` with a path to a JSON file instead.
- A second `missing_hints` response after providing hints means the hint set was incomplete or invalid — see [JSON_CONTRACT.md Error codes](./JSON_CONTRACT.md#error-codes) for `invalid_hints` diagnostics.
- The same flow applies to `push` — substitute `push` and `PushJsonResponse` everywhere.

## Cross-references

- [JSON_CONTRACT.md Programmatic API](./JSON_CONTRACT.md#programmatic-api) — short SDK pitch in the v1-stable contract doc
- [JSON_CONTRACT.md Response statuses](./JSON_CONTRACT.md#response-statuses) — full status catalog
- [JSON_CONTRACT.md Hints flow](./JSON_CONTRACT.md#hints-flow) — hint vocabulary and shapes
- [JSON_CONTRACT.md Error codes](./JSON_CONTRACT.md#error-codes) — error.code table
- [JSON_CONTRACT.md Recommended automation flow](./JSON_CONTRACT.md#recommended-automation-flow) — CLI-side equivalent of the SDK pattern above
