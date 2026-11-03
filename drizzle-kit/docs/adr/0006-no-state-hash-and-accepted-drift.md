# Snapshots carry no state hash, and a reconstructed state might drift

Reconstruct runs through the DDL engine (ADR 0005). The state that it gives for an existing folder therefore depends on three things in the installed drizzle-kit version: the edges with their conditions, the key functions, and the engine code that follows the edges. A key function builds the key of an entity from its names. A later change to any of the three might give another state for the same snapshots. This is a drift, and the team accepts it. A snapshot stores no hash of its state, and nothing compares a reconstructed state with the state at the time of writing. The team wants a less strict flow that later updates do not complicate. A guard turns every wanted change to the way a snapshot reconstructs into a new format, and the old code must then stay for the conversion. This record replaces ADR 0004.

## Considered options

- A state hash in every snapshot (ADR 0004). Reconstruct failed and named the snapshot when it reached another state. The hash also caught a `snapshot.json` that was edited by hand. The canonical form behind the hash could then never change. A wanted change to the way a snapshot reconstructs needed a new format, and the old code had to stay for `up`.
- One reconstruct module for each format, with no imports (ADR 0004). This rule ends, because it does not fit ADR 0005. The engine is shared by all dialects, and a module that calls the engine cannot keep the behavior of the engine unchanged.

## Consequences

- A drift is silent. The next `generate` compares the schema with the drifted state and writes SQL for the difference, although the database needs no change. In trials with a removed edge, that SQL failed at its first statement when it named an entity by an old name, or when it created an entity that the database already had. It ran with no error when it set a value that the database already had.
- All dialects share the engine code, so a change that is made for another dialect might cause a drift in a postgres folder. The `cascade` flag of an edge decides nothing in reconstruct, because a drop does not follow the edges (ADR 0005).
- ADR 0004 named the key functions as a part of the format that the hash guarded. The key functions still decide which entity a stored delta names, and they have no guard now. After a change to a key function, reconstruct skips a delta that names an entity by the old key (ADR 0005).
- The format number changes only when the stored shape of a snapshot changes: its fields and their types. A change to the edges, the key functions, the engine code or the code that applies deltas is no new format, and existing folders are not converted.
- Removing `stateHash` is no new format. No released version wrote a format 9 snapshot, so no converter reads a snapshot that stores a hash.
- `generate` reconstructs every leaf before it writes. If reconstruct fails, the error of `generate` names the migration folder of that leaf. `check` and `migrate` read the shape of the snapshots, the parent links and the stored statements, so a change to the engine cannot stop a deployment.
- `check` with a schema path also reconstructs a state, because it compares that state with the schema. If reconstruct fails there, `check` reports a warning. The conflicts of `check` still come only from the stored statements (ADR 0002). `up` reconstructs when it converts an older folder.
- The error kind `state_hash` is removed.
- `generate` does not apply the new deltas again before it writes a snapshot. A snapshot whose deltas do not reconstruct the schema becomes visible at the next `generate`, which writes SQL for the difference.
- The committed history `tests/postgres/format-9-history` and its tests are removed. No test reconstructs a folder that older code wrote.
- A hand edit of a `snapshot.json` is detected only when it breaks the shape of the file or a parent link, or when it makes a delta throw (ADR 0005).
- A snapshot stores no field for the drizzle-kit version that wrote it.
