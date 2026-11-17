---
name: drizzle
description: Work across the Drizzle ecosystem — drizzle-orm schema and query code, drizzle-kit migrations, and related tooling. Load before reading or editing any Drizzle file (anything importing `drizzle-orm/*`), defining or editing `drizzle.config.ts`, generating migrations, applying schema changes to a database (push), introspecting an existing database into a schema (pull), resolving drizzle-kit prompts or `missing_hints` output, choosing output modes, or decoding drizzle-kit JSON responses and errors — via CLI, SDK, or MCP. Load also when migrations from several git branches meet in one migrations folder, when a drizzle-kit command reports a broken migrations folder or branch conflicts, or when a command asks to run `drizzle-kit up`. Also runs a once-per-session staleness check against the installed `drizzle-kit`.
metadata:
  revision: 16
---

# Drizzle

This skill is the entry point for all Drizzle work — drizzle-orm schema and query code, drizzle-kit migrations, and the wider ecosystem — and carries topic files with deeper detail on the drizzle-kit workflow (see Topic files below). It also runs a one-time staleness check against the installed `drizzle-kit` and notifies the user if it ships a newer agent-skills bundle than the revision embedded here.

## Topic files

- Setting up or changing the migration workflow, `drizzle.config.ts`, the generate-vs-push choice, or dialect quirks → [migrations.md](migrations.md)
- The migrations folder and its snapshots, migrations from several git branches, a broken migrations folder, branch conflicts, or `drizzle-kit up` → [migrations.md](migrations.md)
- Creating a migration SQL file from schema changes → [generate.md](generate.md)
- Applying schema changes directly to a live database → [push.md](push.md)
- Introspecting an existing database into a Drizzle schema → [pull.md](pull.md)
- Resolving `missing_hints`, rename-vs-create, or `confirm_data_loss` → [hints.md](hints.md)
- Choosing `--output` modes and non-interactive runs → [output-modes.md](output-modes.md)
- Decoding the response envelope, error codes, and exit codes → [responses-and-errors.md](responses-and-errors.md)

## Staleness check

Run once per session when this skill is loaded — cache the result for the rest of the conversation and do not re-run on subsequent drizzle work.

Locate the working directory where `drizzle-kit` is meant to run. This is the package that owns `drizzle-kit`, which in a monorepo is often a workspace package rather than the repo root — not a bare binary on `PATH`. Use your judgment to find it. Signals you may draw on, none of them binding and none of them a fixed precedence: the current working directory, the Drizzle file being worked on, the nearest `drizzle.config.ts`, and the nearest `package.json` that declares `drizzle-kit`.

Invoke `drizzle-kit` through whatever package manager the project already uses, determined at your discretion (read the lockfile, the `packageManager` field, or the running agent's environment — no fixed ordering). Use that package manager's mechanism for running an already-installed binary (for example `pnpm exec`, `yarn`, `bun x`, or `npx` without the yes flag), or run the local `node_modules/.bin/drizzle-kit` directly.

The check must run the project-INSTALLED `drizzle-kit` and must NEVER use a download-latest form — not `pnpm dlx`, not `bunx`, not `npx -y`, not `yarn dlx`. Downloading latest always reports the newest revision, which would make this check structurally incapable of ever detecting staleness. This invariant overrides the discretion above: the discretion is only about HOW to locate and invoke the installed binary, never about installed-versus-latest.

Run the resolved `drizzle-kit skills version` in the resolved directory, then compare. The trimmed stdout is the revision the installed `drizzle-kit` ships; this skill's own `metadata.revision` (read from this file's frontmatter when it loads) is the revision of the skills currently in use. Parse both as integers. If the revision `drizzle-kit` ships is strictly greater than this skill's own revision, the skills in use are outdated — surface this message verbatim to the user:

```
drizzle-kit ships a newer agent-skills bundle (revision X) than what's installed (revision Y). Run `drizzle-kit skills` to refresh.
```

Substitute X with the revision the installed `drizzle-kit` ships (the `drizzle-kit skills version` value) and Y with this skill's own `metadata.revision`. Do not auto-update, do not prompt, do not write anything to the project — the recovery action is identical to first-install (re-run `drizzle-kit skills`). If the revision `drizzle-kit` ships is less than or equal to this skill's own revision, stop silently.

If no project-installed `drizzle-kit` can be found or run AND the pending operation actually requires it — running a `drizzle-kit` command, using the Drizzle SDK, performing a migration verb (`generate` / `push` / `pull` / `up` / `check` / `export`), or handling drizzle-kit output — tell the user in one short line that `drizzle-kit` is required for that operation and to install it with the project's package manager. For example: "`drizzle-kit` is required to run `push` — install it with the project's package manager." If `drizzle-kit` is absent but the pending operation does not require it (just reading or editing a `drizzle-orm/*` source file), stay silent — do not nag.

If `drizzle-kit` is found and runs but the call errors — non-zero exit, stdout that does not parse as a positive integer, or any other failure — stop silently as before. The "required" notice is only for the not-found case above.

## Surface selection

drizzle-kit exposes the same migration verbs (`generate`, `push`, `pull`, `up`, `check`, `export`) over three surfaces — CLI, SDK, and an MCP server — that all return the identical JSON envelope and consume the same `hints` array. The MCP server also has a `fix_conflicts` tool, for postgresql only. On the CLI it is `drizzle-kit generate --fix-conflicts`, and in the SDK it is `generate({ fixConflicts: true })`. The procedural topic files ([hints.md](hints.md), [responses-and-errors.md](responses-and-errors.md)) apply unchanged regardless of surface; only the invocation differs. Pick the surface per verb:

1. If a `mcp__drizzle__<verb>` tool is available in the session, prefer it over shelling out. Its `structuredContent` is the same envelope; resolve a `missing_hints` result with the same `hints` array and re-call the tool.
2. Otherwise fall back to the CLI: `drizzle-kit <verb> --output json`.

Two cases where the CLI is the better surface even when the MCP tool exists:

- **Monorepos.** The target package is often a workspace package, not the repo root, and the MCP server resolves config from its own process cwd, not the client's. If the server was launched outside the target package, pass an explicit `config` to the tool, or run the CLI from that package through the package manager the project uses.
- **Path overrides.** MCP tools take only `config` / `hints` / etc. — there is no `schema` / `out` / `dialect` override. When a task needs those, use the CLI flags.
