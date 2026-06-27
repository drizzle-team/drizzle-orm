# drizzle-kit MCP server

`drizzle-kit mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, exposing drizzle-kit's migration lifecycle as MCP tools to any MCP-capable agent (Claude Code, Cursor, and others). Launch it from the project root so config resolution defaults to the right working directory:

```sh
npx drizzle-kit mcp
```

In a monorepo, "project root" means the workspace package where `drizzle-kit` and `drizzle-orm` are installed — point the server's working directory there, not the repository root. `npx` runs the `drizzle-kit` resolved from that directory; if it finds no local install it fetches a separate copy that cannot resolve your project's `drizzle-orm` and fails the version check.

## Adding the server to your client

See your MCP client's documentation for how to register a stdio server. As an example, a project-scoped entry looks like:

```json
{ "mcpServers": { "drizzle": { "command": "npx", "args": ["drizzle-kit", "mcp"] } } }
```

## Tools

| Tool | Parameters | Annotations |
|------|-----------|-------------|
| `generate` | `config?`, `hints?`, `name?`, `custom?`, `ignoreConflicts?` | non-destructive |
| `push` | `config?`, `hints?` | destructive |
| `check` | `config?`, `ignoreConflicts?` | read-only, idempotent |
| `export` | `config?` | read-only, idempotent |
| `up` | `config?` | idempotent (not read-only — rewrites snapshots in place) |
| `pull` | `config?`, `init?` | `destructiveHint: false` (static — see the `--init` signal below) |

Each tool returns the same JSON envelope as the CLI `--output json` / SDK contract — see [JSON_CONTRACT.md](./JSON_CONTRACT.md) for the full envelope spec.

## Consent round-trip (`missing_hints`)

When `generate` or `push` encounters an ambiguous or destructive change it cannot auto-resolve (a rename, a data-loss operation), the tool returns `status: 'missing_hints'` with an `isError: true` result carrying an `unresolved[]` array. The agent inspects each item, picks a resolution, and re-calls the same tool with a `hints[]` array. The tools expose no `force` parameter — every unresolved decision must be acknowledged explicitly. See [SDK.md — Handling `status: 'missing_hints'`](./SDK.md) for the hint vocabulary and round-trip example.

## `pull --init` destructive signal

The static `listTools` annotation for `pull` is `destructiveHint: false` and cannot flip per call. When the agent calls `pull` with `init: true`, the tool runs the initial migration against the live database — a destructive write — and signals this per-call on the result rather than on the static annotation. The escalation rides the result `_meta` key:

```json
{ "_meta": { "com.drizzle.team/pull.destructiveHint": true } }
```

The `_meta` key is set whenever `init: true`, derived from the input alone and independent of `isError`, so a failed `init` call still warns the client. A `pull` without `init` (or with `init: false`) carries no such `_meta` key. This is implemented in `src/mcp/server.ts`.

## Explicit `config` parameter

Every tool accepts an optional `config` path (e.g. `config: "drizzle.config.ts"`). When omitted, resolution follows the standard `drizzle.config.*` lookup in the directory where `drizzle-kit mcp` was launched — the server process cwd, typically the project root. This means config resolution is anchored to the server, never to the MCP client's working directory.
