---
status: superseded by ADR-0005
---

# Diff snapshots store only their own deltas

From snapshot format 9 on, only the first snapshot in a migrations folder holds the full schema state. Every other snapshot holds the deltas of its own migration: one keyed create, drop, alter, rename or relocate per changed entity. A rename is a key change that the user decided. A relocate is a key change that followed another entity's rename, such as a column of a renamed table. Replaying deltas never follows references between entities, so a file rebuilds the same state even after the reference rules of the DDL model change. ADR 0003 replaces the relocate and the stored effects of a rename with instructions.

## Considered options

- Full state in every snapshot (format 8). Each snapshot repeats the whole schema.
- Structural deltas plus the full list of `JsonStatement`s. This keeps rename intent, but every change to a statement shape becomes a format change, and one statement is often several times larger than its delta.
- One rename per decision, with child rows moved by the reference rules during replay. The files are the smallest. A later change to those rules can make old files fail to replay, or rebuild a wrong state without any error.

## Consequences

- Statements are computed when needed. `check` runs `ddlDiff` with the rename deltas as the rename decisions. ADR 0002 replaces this consequence: every snapshot stores its statements.
- `ddlDiff` produces the deltas in the same pass that builds the statements. `update` returns a log of every row it changed, marked as requested by the caller or caused by a reference. The final diff over all keys supplies the remaining creates, drops and alters. A replay check in the test helpers guards this, because a change to the parent state that bypasses `update` would otherwise go unrecorded.
- A merge snapshot stores only its own deltas, relative to its combined state. The combined state is the state of its first parent, which is the leaf with the newest folder name, plus the rest of the merge's history replayed in folder-name order. During that replay, drops and alters of missing keys are skipped. This rule is part of the format, and changing it would change the meaning of old merge files.
- A folder name must sort after the names of its parents, because both the replay and the migrator run migrations in folder-name order. `generate` names new folders to keep that rule, and every command checks it.
