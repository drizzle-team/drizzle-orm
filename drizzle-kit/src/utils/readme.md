# How commutativity works

`check`, `generate` and `migrate` call `detectNonCommutative` of the dialect with every `snapshot.json` in the migrations folder, parsed, in folder-name order. It returns a report with the conflicts between branches and the ids of the leaves. A leaf is a snapshot that no other snapshot lists in its `prevIds`.

Every migration has its own folder, `<out>/<YYYYMMDDHHMMSS>_<name>/`, with `migration.sql` and `snapshot.json`. Every snapshot has an `id` and a `prevIds` array. The first snapshot has the origin id `00000000-0000-0000-0000-000000000000` as its only parent.

Postgres, mysql, sqlite and turso have a branch check. The other dialects have none.

## Postgres: compare branches statement by statement

Postgres snapshots use format 9. The first snapshot is a base snapshot with the full state. Every later snapshot is a diff snapshot with the deltas of its own migration.

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
  ] }

// 20260101120003_b/snapshot.json (branch b): the same two creates, with "id": "b1" and "prevIds": ["p1"]
```

`PostgresCommutativity.detectNonCommutative` builds the snapshot graph and calls `detectBranchConflicts` in `src/commutativity/engine.ts`:

1. For each pair of leaves X and Y, the branch of X is every snapshot in the history of X that is missing from the history of Y. The branch of Y is the reverse. Here the branch of `a1` is `[a1]`, and the branch of `b1` is `[b1]`.
2. For each snapshot in a branch, `snapshotStatements` derives the statements with `ddlDiff`. The diff goes from the snapshot's starting state (its parent's state, or the combined state of a merge) to its own state. The snapshot's `rename` deltas are the rename decisions, and `relocate` deltas are not. The diff keeps no generated names, so a `drop` and a `create` of a constraint in the deltas stay a drop and a create statement, as in the SQL of the migration.
3. Every statement of one branch is compared with every statement of the other. `buildFacetPaths` in `src/dialects/postgres/commutativity.ts` gives each statement the nodes that it owns, destroys and needs. Owning and destroying are writes, and needing is a read. Two statements conflict when one writes a node that the other writes or needs.

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

A merge snapshot lists every leaf in `prevIds`, and its own statements come from its combined state. The snapshots that reach a merge through its other parents are ordinary members of a branch.

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
