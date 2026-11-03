---
status: superseded by ADR-0007
---

# Snapshots store their statements for check

From snapshot format 9 on, every snapshot stores the statements of its own migration, and `check` compares the stored statements of two branches. A stored statement holds everything that its SQL writer and its claim rule read, so the SQL of a migration can be rebuilt from its statements. `check` takes its conflicts only from the stored statements and no longer runs the diff. This replaces the consequence "Statements are computed when needed" of ADR 0001.

## Considered options

- Statements computed when needed (ADR 0001). `check` rebuilt the state before and after every snapshot and ran `ddlDiff`. A newer diff engine could then give other statements for an old migration, and `check` depended on the whole history.
- Names only. A stored statement keeps only the names that the claim rules read. The files are smaller. Every rule that needs one more field then becomes a format change, and two statements with different values have the same stored form.
- The full statement as `generate` builds it. This needs no function for each statement kind. Internal fields then become part of the format.

## Consequences

- Every statement kind has a function that makes its stored form. The SQL writer and the claim rules are typed on the stored form, so the compiler rejects a writer or a rule that reads a field which is not stored.
- A snapshot repeats data. A create statement holds the rows that the create deltas or the base state hold too. On a small schema, a snapshot with full statements was 1.6 to 1.8 times the size of a snapshot with names only. ADR 0001 rejected stored statements for their size. This decision accepts that size, because the claim rules change often, and a rule can read anything that the SQL contains without a format change.
- Two statements are the same change when their stored forms are equal. `check` accepts the same change on two branches for the statement kinds whose SQL can run twice.
- A base snapshot stores statements too, because two histories with different roots put a base snapshot inside a branch.
- A custom migration stores no statements, so `check` does not see SQL that the user wrote by hand.
- `up` computes the statements when it converts an older folder.
- The SDK returns a schema state: a full state with an id and parents, and no statements. A migrations folder never holds one. Payload stores these objects and passes two of them to `generateMigration`, in both directions.
