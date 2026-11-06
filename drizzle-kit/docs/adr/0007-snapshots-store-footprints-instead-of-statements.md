# Snapshots store footprints instead of statements

A format 9 snapshot stores its deltas and the footprints of its migration. It stores no statements. `check` compares the footprints of two branches and needs nothing else to find a conflict. A snapshot stores one footprint for each statement: the kind and the target of the statement, and the nodes that it writes, reads and shares with other statements. The commutativity code builds the footprints from the statements when `generate` writes the snapshot. This record replaces ADR 0002. The team decided it in the meeting of 2026-10-19.

## Considered options

- Stored statements (ADR 0002). Every statement kind had a stored form, a zod schema and a function that built the stored form, and the SQL writer read the stored form. The convertor then depended on a type that is saved to disk. A change to a stored form needed a format change and a review that remembered it. The team found this layer too large for its use, because `check` only needs the footprints.
- Statements computed from the deltas at read time. `check` already reads every snapshot. A change to the DDL engine or to the diff could then give other statements for an old migration, and the conflicts of an old migration would change with it.
- One footprint file for the whole repository, with one key for each migration. It saves one field in each snapshot. The team keeps the footprints in the snapshot, next to the deltas.
- Checkpoint snapshots that store a full state in the middle of a history. They would make reconstruct faster. The extra cost in code and in edge cases (a checkpoint inside a branch, a merge with two parents) is larger than the gain.

## Consequences

- The convertor writes SQL from the internal statement again. It does not depend on a stored type.
- The stored statement schemas and the functions that build stored forms are removed.
- A rename is not stored on its own. It is a delta already (ADR 0005). The diff renames an entity only when the user chose the rename, with a hint or in the interactive resolver. The DDL collects its renames, so the diff reads them from the DDL at the end.
- A footprint is `{ statementType, statementTarget, writes, reads?, sharedWrites?, sqlHash? }`. `statementTarget` is a tuple from the outer name to the inner name, for example `['column', 'public', 'users', 'age']`. The report of `check` builds its text from `statementType` and `statementTarget`. A role has the kind `role`, and an index target names its schema.
- `writes`, `reads` and `sharedWrites` hold nodes, and `check` compares the nodes of two footprints directly. A write conflicts with a write, a shared write or a read of the same node. A shared write also conflicts with a read. Two shared writes and two reads do not conflict. `check` builds no other strings from the nodes.
- `sqlHash` is a hash of the SQL of an idempotent statement, and only an idempotent statement has it. Two footprints on two branches with the same `sqlHash` are one change, and they do not conflict with each other. Each of them is still checked against every other footprint of the other branch.
- The footprints that an old snapshot stores stay as they were written, and `up` does not rewrite them when the footprint rules change. The format number changes only when the stored shape of a footprint changes.
- The `facet` code is renamed to `footprint`. The abstract commutativity class stays, so that other dialects can extend it later.
- Generated SQL gets no checks before or after a statement. A migration stays plain SQL that the user can edit and run without drizzle-kit.
