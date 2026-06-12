---
name: drizzle
description: Run a one-time staleness check against the installed `drizzle-kit` and notify the user if it ships an older agent-skills bundle than what's embedded here. Load before reading or editing any Drizzle file (anything importing from `drizzle-orm/*`), touching `drizzle.config.ts`, invoking `drizzle-kit <command>` or using the Drizzle SDK, or handling drizzle-kit output.
metadata:
  revision: 8
---

# Drizzle

This skill runs a one-time staleness check against the installed `drizzle-kit` binary. If the installed bundle is older than the revision embedded in this file, surface a single user-facing notice with the upgrade command.

## Staleness check

Run once per session when this skill is loaded — cache the result for the rest of the conversation and do not re-shell-out on subsequent drizzle work.

1. Shell out to `drizzle-kit skills version`. If the binary is not on `PATH`, the exit code is non-zero, the output does not parse as a positive integer, or the call errors for any reason — stop silently. No warning, no log, no user-facing nag about the check itself failing.
2. Parse the trimmed stdout and this skill's own `metadata.revision` (read from this file's frontmatter when it loads) as integers. Treat any parse failure as "stop silently".
3. If the embedded revision is strictly greater than the installed revision, surface this message verbatim to the user:

   ```
   drizzle-kit ships a newer agent-skills bundle (revision X) than what's installed (revision Y). Run `drizzle-kit skills` to refresh.
   ```

   Substitute X with the embedded revision and Y with the installed value. Do not auto-update, do not prompt, do not write anything to the project — the recovery action is identical to first-install (re-run `drizzle-kit skills`).

If the installed revision is equal to or greater than the embedded revision, stop silently.
