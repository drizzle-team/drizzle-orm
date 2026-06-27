---
name: drizzle-output-modes
description: "Choose and interpret drizzle-kit `--output text` vs `--output json`, reason about interactivity in non-TTY contexts, and read the human-readable missing-decisions text report. Load when deciding which `--output` mode to pass, when a drizzle-kit run in a non-TTY context needs to stay non-interactive, or when parsing a `missing_hints: N unresolved decisions` text report."
metadata:
  version: "1.0.0"
---

# Drizzle output modes

If the `drizzle` skill has not been loaded yet this session, load it first — it carries the staleness check and the MCP-vs-CLI surface-selection rule that govern every drizzle-kit invocation.

Drizzle Kit `generate` / `push` / `check` render results in one of two output modes, selected with `--output`. Output format and interactivity are separate axes: the output mode controls *how* results are rendered; interactivity controls *whether* the CLI may prompt.

- `--output text` (the default) renders human-readable progress and results on stdout, with typed errors on stderr. When a command has unresolved decisions and cannot prompt, it writes the missing-decisions report (below) to stdout and exits with code 2.
- `--output json` emits a single machine-readable JSON envelope on stdout for every status (including errors), and is always non-interactive.

`check --output json` rides the same plumbing: it is a no-hint, non-interactive gate that emits an `ok` envelope when the migrations folder is valid and a `check_error` envelope for snapshot-integrity problems or unreported branch conflicts. It never reaches the missing-decisions path. The `drizzle-responses-and-errors` skill decodes the `check_error` envelope.

## Interactivity

A command is interactive only when it is rendering text **and** stdin is a TTY:

```
interactive = output === 'text' && !!process.stdin.isTTY
```

`--output json` is therefore always non-interactive, regardless of whether stdin is a TTY. Under `--output text`, interactivity is determined solely by whether stdin is a TTY (`!process.stdin.isTTY` means non-interactive).

When the CLI is non-interactive and reaches a decision it cannot resolve from your `--hints` / `--hints-file`, it does not prompt. Under `--output json` it returns a `missing_hints` envelope; under `--output text` it prints the missing-decisions report below. The `drizzle-hints` skill covers building the reply that resolves those decisions.

## Missing-decisions text report

Under `--output text`, when the CLI is non-interactive (stdin is not a TTY) and at least one decision is still unresolved, it prints a human-readable report to stdout and exits with code 2. `rename_or_create` decisions are listed first (discovery order), then `confirm_data_loss` decisions (discovery order), with a continuous 1-based index across both groups. Each item shows an `Add to --hints:` block with the snippet(s) to supply; `rename_or_create` items show both a `rename` and a `create` snippet joined by `OR`.

The `from` placeholders are intentionally invalid JSON — replace the angle-bracket segments with the real identifier of the entity being renamed before re-running. The report only suggests the inline `--hints '<json-array>'` form, never `--hints-file`. A two-item run renders like this:

```
missing_hints: 2 unresolved decisions

1. Rename or create  —  table  public.users_v2
   Add to --hints:
     { "type": "rename", "kind": "table", "from": ["<schema>", "<old_name>"], "to": ["public", "users_v2"] }
     OR
     { "type": "create", "kind": "table", "entity": ["public", "users_v2"] }

2. Confirm data loss  —  table  public.legacy_audit  (reason: non_empty)
   Add to --hints:
     { "type": "confirm_data_loss", "kind": "table", "entity": ["public", "legacy_audit"] }

Re-run with --hints '<json-array>'. Exit code 2.
```
