---
status: superseded by ADR-0005
---

# The effects of a rename are stored as instructions

A rename changes other rows too, such as the columns of a renamed table, or the column list of a key after a column rename. From snapshot format 9 on, a snapshot stores these effects as instructions. An instruction selects rows by what they reference and writes the new name into them, as the database does when it applies a rename to its catalog. The replay runs each instruction against the state that it has at that moment, so two branches whose SQL commutes rebuild the same combined state in both orders. This replaces the relocate delta and the stored whole-value effects of ADR 0001.

## Considered options

- Stored effects with key translation. Each effect names the row that it changes by key, with ops that replace one value or one list element. A merge then translates the keys of one branch through the renames of the other branch. It gave the same results in tests, and it needs a second mechanism in the replay.
- Rules at replay. The snapshot stores only the rename, and the replay applies its effects through the reference rules. The files are the smallest. The reference rules and the engine that applies them then become part of the format, and a change to either one changes how old files rebuild.
- Stable ids. Every row gets an id, references hold ids, and a rename changes one row. A migration that is generated again gets new ids, so later snapshots that target the old ids no longer apply. A delta shows ids, so a reviewer cannot read it without the base state. An id still comes from matching names in the diff.

## Consequences

- `generate` derives the instructions from the reference rules when the user decides a rename. It writes one instruction for every rule that points at the renamed entity type, whether a matching row exists or not, so the list also reaches rows that only another branch holds. A column rename stores 5 instructions, a table rename 9 and a schema rename 14.
- The replay reads only the state and the key functions. A later change to the reference rules does not change how an existing file rebuilds. A rule that is missing when a file is written stays missing in that file.
- There are three instruction ops. `update` sets fields. `replace_in_list` replaces a string element of a list. `update_list_items` changes a field of an object element of a list.
- A keyed delta names its row by the names that its SQL uses. An index is therefore keyed by schema and name, because `DROP INDEX` and `ALTER INDEX RENAME` do not name the table. With the table in the key, a table rename on one branch made the index delta of the other branch miss its row.
- A replay that moves a row onto a key that another row holds throws. Only a history that `check` rejects can reach this state.
- A small rename takes more bytes than its stored effects took. On a wide table, the instruction list keeps its length, and the stored effects grew with every row.
