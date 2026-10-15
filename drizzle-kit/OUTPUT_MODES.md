# Drizzle Kit output modes

Drizzle Kit commands render their results in one of two output modes, selected with `--output`:

- `--output text` (the default) renders human-readable progress and results, including a human-readable report when a command needs decisions you haven't supplied.
- `--output json` emits the single machine-readable JSON envelope documented in [`./JSON_CONTRACT.md`](./JSON_CONTRACT.md).

Output format, interactivity, and hint resolution are three orthogonal axes. The output mode controls *how* results are rendered; interactivity controls *whether* the CLI may prompt; hints (`--hints` / `--hints-file`) supply decisions ahead of time so the CLI never has to ask.

## `--output text | json`

`generate`, `push`, `check`, `pull`, `up`, and `export` all accept `--output text | json`.

| Mode | Default | Emits |
| --- | --- | --- |
| `text` | yes | Human-readable progress and results on stdout; typed errors on stderr. When a command has unresolved decisions, the missing-decisions report (below) is written to stdout and the process exits with code 2. |
| `json` | no | The single JSON envelope described in [`./JSON_CONTRACT.md`](./JSON_CONTRACT.md), on stdout, for every status (including errors). |

Connection-layer driver-selection chatter (the `Using '<driver>' driver for database querying` lines a connecting command prints while it picks a database driver) follows the same rule: under `--output json` it is suppressed so stdout stays a single JSON envelope, and under `--output text` it still prints as human progress.

`check` is a no-hint, non-interactive gate, so it never reaches the missing-decisions path. Under `--output text` it keeps its current human output (`Everything's fine 🐶🔥` on success, the colorized conflict tree on non-commutativity); under `--output json` it emits the `ok` / `check_error` envelopes documented in [`./JSON_CONTRACT.md`](./JSON_CONTRACT.md).

`pull`, `up`, and `export` are likewise non-interactive (none of them ever reaches the missing-decisions path):

- `pull` — under `--output text` it keeps its banners and hanji introspection progress; under `--output json` it suppresses that chatter and emits the single paths-manifest `ok` envelope (or an `error` envelope on a connect/introspect failure). `pull` connects to a live database, so the driver-selection chatter rule above applies to it too.
- `export` — under `--output text` it prints the SQL statements and any schema warnings; under `--output json` it emits the `{ status, dialect, statements, warnings }` envelope.
- `up` — under `--output text` its output is byte-identical to today's human output; under `--output json` it emits the `{ status, dialect, upgraded }` envelope.

## Interactivity

A command is interactive only when it is rendering text **and** stdin is a TTY:

```
interactive = output === 'text' && !!process.stdin.isTTY
```

`--output json` is therefore always non-interactive, regardless of whether stdin is a TTY. Under `--output text`, interactivity is determined solely by whether stdin is a TTY (`!process.stdin.isTTY` means non-interactive).

When the CLI is non-interactive and a command reaches a decision it cannot resolve from your `--hints` / `--hints-file`, it does not prompt. Under `--output json` it returns a `missing_hints` envelope; under `--output text` it prints the missing-decisions report below.

## Missing-decisions text report

When you run a command with `--output text` but the CLI is non-interactive (stdin is not a TTY) and at least one decision is still unresolved, the CLI prints a human-readable report to stdout and exits with code 2. The rendered example below shows the full format.

The `from` placeholders are intentionally invalid JSON: you must replace the angle-bracket segments with the real identifier of the entity being renamed before re-running. The placeholder is keyed off the entity's arity, e.g. a two-segment identifier produces `["<schema>", "<old_name>"]`. The CLI never suggests `--hints-file` in the report — only the inline `--hints '<json-array>'` form.

Under `--output text` the report fires only when stdout is not a TTY, so the ANSI styling auto-downgrades to plain ASCII — which is exactly what a piped caller reads. A two-item run renders like this:

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

## See also

- [`./HINTS.md`](./HINTS.md) — the output-agnostic hint vocabulary (kinds, reasons, identifier formats, rename/create/confirm semantics).
- [`./JSON_CONTRACT.md`](./JSON_CONTRACT.md) — the machine-readable JSON envelope contract (statuses, error codes).
- [`./SDK.md`](./SDK.md) — the programmatic SDK surface, which always receives the JSON envelope.
