# How commutativity works

`check`, `generate` and `migrate` call `detectNonCommutative` of the dialect with every `snapshot.json` in the migrations folder, parsed, in folder-name order. It returns a report with the conflicts between branches and the ids of the leaves. A leaf is a snapshot that no other snapshot lists in its `prevIds`.

Every migration has its own folder, `<out>/<YYYYMMDDHHMMSS>_<name>/`, with `migration.sql` and `snapshot.json`. Every snapshot has an `id` and a `prevIds` array. The first snapshot has the origin id `00000000-0000-0000-0000-000000000000` as its only parent.

Postgres, mysql, sqlite and turso have a branch check. The other dialects have none.

## Postgres: compare branches statement by statement

Postgres snapshots use format 9. The first snapshot is a base snapshot with the full state. Every later snapshot is a diff snapshot with the deltas of its own migration. Every snapshot also stores the statements of its migration in `statements`, as `generate`, `pull` or `up` computed them, and the hash of its state in `stateHash`.

The code that rebuilds a state from snapshots is part of the format: a change to it can give another state for an existing folder, with no error. Two guards catch this. `reconstruct` in `src/dialects/postgres/snapshot.ts` compares the rebuilt state with `stateHash` for the snapshot that it was asked for and for the first parent of every merge on the way. `check` rebuilds every leaf once for this comparison, so a wrong rebuild fails in CI. `generate` calls `assertDeltasRebuildState` before it writes a diff snapshot, because the hash cannot catch wrong deltas in the run that computes it. The canonical form behind the hash (`stateHash`) must never change: rows in the order of their keys, fields in the order of their names, both by code unit, and no null fields.

### Renames and instructions

A rename changes other rows too: the columns of a renamed table, or the column list of a key after a column rename. A diff snapshot stores a rename as one keyed `rename` delta, followed by instructions. An instruction selects the rows of one entity type by field values and writes the new name into them:

- `update` sets fields, for example `table` on every column of a renamed table.
- `replace_in_list` replaces a string in a list of strings, for example a column name in `pks.columns`.
- `update_list_items` sets fields of the objects in a list that have the values of `match`, for example `value` in `indexes.columns`.

`renameInstructions` in `src/dialects/dialect.ts` derives the instructions from the reference rules (`edges` in `src/dialects/postgres/ddl.ts`) when `ddlDiff` applies a rename decision. It writes one instruction for every rule that points at the renamed entity type, and for every rule that points at a type whose keys change as a result, whether a row matches or not. So a rename of one branch also reaches the rows that another branch adds, and two branches whose SQL commutes rebuild the same combined state with either leaf as the first parent. The `when` function of a rule may read only the fields that the rule maps, because no row is at hand when the instructions are written.

A role rename writes the new name at the old place of the role list of a policy, and `drizzle.ts` sorts that list. So before `ddlDiff` compares the states, it gives the new state the role order of the old state when both lists hold the same roles. Without this, the snapshot would store an `alter` of the whole list, and that delta would overwrite a role rename of another branch in a merge.

The key functions (`identity` in `src/dialects/postgres/ddl.ts`) are part of the format too, because a keyed delta names its row by key. An index is keyed by schema and name, without its table: `DROP INDEX` and `ALTER INDEX` do not name the table, so a table rename on one branch must not hide the index from a keyed delta of another branch.

While `ddlDiff` records deltas, `update` changes the starting state only through the deltas that it records. It does not follow the reference edges there, so the state that the diff continues with is the state that a replay gives.

### The replay module

The whole replay of format 9 is in `src/dialects/postgres/replay-v9.ts`: `applyDeltas` runs keyed deltas and instructions, `reconstruct` gives the state after a snapshot, and `startingState` gives the state that a merge starts from. The functions of the same names in `src/dialects/postgres/snapshot.ts` call them with the entity definitions and the state hash check. `ddlDiff` applies the deltas that it records through the same `applyDeltas`.

The module imports no other module, and a test in `tests/postgres/replay-v9.test.ts` fails if it gets an import. It reads no reference rules. It needs only the rows and the key functions, which it gets as data. So a rule that is added later does not change how an existing file rebuilds, and a rule that is missing when a file is written stays missing in that file.

Do not change the behavior of this module. A change can give another state for a folder that already exists. If the replay must change, add a new snapshot format with its own replay module next to this one. `generate` then writes the new format, and `up` rebuilds the folders of format 9 with `replay-v9.ts` before it converts them.

A `rename` or an `update` that moves a row onto a key that another row holds throws `KeyCollisionError`. `up` turns that into a refusal for an old merge whose branches gave one name to two entities.

### How `check` compares two branches

Example: `p1` is the base, and two git branches each add one migration on top of it.

```jsonc
// 20260101120001_init/snapshot.json
{ "type": "base", "version": "9", "dialect": "postgres", "id": "p1",
  "prevIds": ["00000000-0000-0000-0000-000000000000"], "ddl": [] }

// 20260101120002_a/snapshot.json (branch a)
{ "type": "diff", "version": "9", "dialect": "postgres", "id": "a1", "prevIds": ["p1"],
  "deltas": [
    { "op": "create", "row": { "schema": "public", "name": "users", "isRlsEnabled": false, "entityType": "tables" } },
    { "op": "create", "row": { "schema": "public", "table": "users", "name": "email", "type": "varchar", "typeSchema": null,
      "notNull": false, "dimensions": 0, "default": null, "generated": null, "identity": null, "entityType": "columns" } }
  ],
  "statements": [
    { "type": "create_table", "table": { "schema": "public", "name": "users", "columns": [ /* the email column */ ] } }
  ] }

// 20260101120003_b/snapshot.json (branch b): the same deltas and statements, with "id": "b1" and "prevIds": ["p1"]
```

`PostgresCommutativity.detectNonCommutative` builds the snapshot graph and calls `detectBranchConflicts` in `src/commutativity/engine.ts`:

1. For each pair of leaves X and Y, the branch of X is every snapshot in the history of X that is missing from the history of Y. The branch of Y is the reverse. Here the branch of `a1` is `[a1]`, and the branch of `b1` is `[b1]`.
2. For each snapshot in a branch, the check reads the stored `statements`. It runs no diff and rebuilds no state for them, so the result for an old migration does not depend on the current diff code. A custom migration stores no statements, and a base snapshot stores the create statements of its state.
3. Every statement of one branch is compared with every statement of the other. `buildFacetPaths` in `src/dialects/postgres/commutativity.ts` gives each statement the nodes that it owns, destroys and needs. Owning and destroying are writes, and needing is a read. Two statements conflict when one writes a node that the other writes or needs. One pair is left out: two equal stored statements whose SQL gives the same result on a second run (`isRepeatable`), because a claim says which object a statement changes, and not what it changes the object to. A statement kind is repeatable only if every SQL statement that its writer can give runs a second time. So `alter_column` is not repeatable when it adds or drops an identity, drops a generated expression, or creates or drops the sequence of a serial column.

Both branches here create `public.users`, so the report has one conflict:

```ts
{
  conflicts: [
    {
      parentId: 'p1', // the fork point: the newest snapshot in both histories
      parentPath: 'drizzle/20260101120001_init',
      branchA: {
        chain: [{ id: 'a1', path: 'drizzle/20260101120002_a' }],
        statementDescription: 'create_table: users in public schema (20260101120002_a)',
        target: { kind: 'table', name: 'users', schema: 'public' },
        action: 'create_table',
        source: { id: 'a1', path: 'drizzle/20260101120002_a' }, // the snapshot that holds the statement
      },
      branchB: {
        chain: [{ id: 'b1', path: 'drizzle/20260101120003_b' }],
        statementDescription: 'create_table: users in public schema (20260101120003_b)',
        target: { kind: 'table', name: 'users', schema: 'public' },
        action: 'create_table',
        source: { id: 'b1', path: 'drizzle/20260101120003_b' },
      },
    },
  ],
  leafNodes: ['a1', 'b1'],
}
```

Each branch is compared snapshot by snapshot, so a change that a branch makes and later reverts still counts. When branch a adds column `c` and later drops it, and branch b adds `c` with another type, the report has a conflict. The migrator runs both adds in folder-name order, so a fresh database would fail.

A merge snapshot lists every leaf in `prevIds`, and it stores only the statements of its own change. The snapshots that reach a merge through its other parents are ordinary members of a branch.

The report has only the first conflict of each pair of leaves. `planConflictFix` in `src/cli/commands/fix-conflicts.ts` plans what `generate --fix-conflicts` deletes: the `source` of every reported statement with all its children. It checks the rest of the history again and repeats until no conflict is left.

The facet rules are also the source of the commutativity matrix. `tests/postgres/commutativity-matrix.json` is generated from them, and `tests/postgres/commutativity.matrix-gen.test.ts` fails when the two differ.

## mysql, sqlite and turso: compare full states at each fork

These dialects store the full state in every snapshot: `{ version, dialect, id, prevIds, ddl, renames }`. Their check uses the conflict-list walk, `ConflictListCommutativity.detectNonCommutative`:

1. `buildSnapshotGraph` maps each snapshot id to its node.
2. `buildPrevToChildren` maps each parent id to the ids of the snapshots that list it in `prevIds`. A parent with more than one child is a fork:

   ```ts
   prevToChildren = {
     '00000000-0000-0000-0000-000000000000': ['p1'],
     p1: ['a1', 'b1'], // fork
   };
   ```

3. For each fork, `collectLeaves` finds the leaves below every child. `diffSnapshots` diffs the full state of the fork parent against the full state of each leaf.
4. The statements of each pair of leaves under different children are compared through the `conflicts` lists in `getStatementDefinitions` of the dialect. The first match becomes a conflict with the same shape as above. `statementDescription` has no folder name here.

This walk compares only the net effect of each branch, so a change that a branch later reverts does not count.

When no branches conflict and several leaves are open, `buildReport` adds `commutativeBranches`: the statements of every leaf, diffed from the newest snapshot in the history of all leaves. `generate` replays these statements on that snapshot to get the state that the merge migration starts from.
