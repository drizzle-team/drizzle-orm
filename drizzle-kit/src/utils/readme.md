# How commutativity works

`check`, `generate` and `migrate` call `detectNonCommutative` of the dialect with every `snapshot.json` in the migrations folder, parsed, in folder-name order. It returns a report with the conflicts between branches and the ids of the leaves. A leaf is a snapshot that no other snapshot lists in its `prevIds`.

Every migration has its own folder, `<out>/<YYYYMMDDHHMMSS>_<name>/`, with `migration.sql` and `snapshot.json`. Every snapshot has an `id` and a `prevIds` array. The first snapshot has the origin id `00000000-0000-0000-0000-000000000000` as its only parent.

Postgres, mysql, sqlite and turso have a branch check. The other dialects have none.

## Postgres: compare branches statement by statement

Postgres snapshots use format 9. The first snapshot is a base snapshot with the full state, and a folder holds one base snapshot. Every later snapshot is a diff snapshot with the deltas of its own migration: one `create`, `drop`, `alter` or `rename` for each changed entity. A delta names its entity by key. Every snapshot also stores the statements of its migration in `statements`, as `generate`, `pull` or `up` computed them.

drizzle-kit reconstructs the state with the installed version, so the result depends on three things in that version: the edges with their conditions (`edges` in `src/dialects/postgres/ddl.ts`), the key functions (`identity` in the same file), and the engine code that follows the edges (`update` in `src/dialects/dialect.ts`). A later change to one of them can give another state for an existing folder. This is a drift. drizzle-kit does not detect a drift. After a drift, the next `generate` writes SQL for the difference.

The format number changes only when the stored shape of a snapshot changes: its fields and their types. A change to the edges, the key functions, the engine code or the code that applies deltas is no new format, and existing folders are not converted.

`generate` reconstructs every leaf before it writes, and `up` reconstructs when it converts an older folder. `check` and `migrate` reconstruct no state: they read the shape of the snapshots, the parent links and the stored statements.

### Renames

A rename changes other entities too: the columns of a renamed table, or the column list of a key after a column rename. A diff snapshot stores a rename as one `rename` delta, and it stores nothing for the entities that reference the renamed entity. Reconstruct applies the rename through the edges. `update` finds every entity that references the renamed entity and writes the new name into it. When the key of such an entity changes too, `update` continues with the entities that reference that entity, so a schema rename reaches the columns of its tables.

A rename reaches the entities that the state holds at that moment. So a rename of one branch also reaches the entities that another branch added.

`update` reaches a referencing entity only through the referenced entity. drizzle-kit does not support an entity that a schema file uses and does not export, so the state holds every referenced entity.

A role rename writes the new name at the old place of the role list of a policy, and `drizzle.ts` sorts that list. So before `ddlDiff` compares the states, it gives the new state the role order of the old state when both lists hold the same roles. Without this, the snapshot would store an `alter` of the whole list, and that delta would overwrite a role rename of another branch in a merge.

An index is keyed by schema and name, without its table: `DROP INDEX` and `ALTER INDEX` do not name the table, so a table rename on one branch must not hide the index from a delta of another branch.

### How a state is reconstructed

`src/dialects/postgres/reconstruct.ts` holds the code that applies deltas: `applyDeltas` applies a list of deltas to a state, `reconstruct` gives the state after a snapshot, and `startingState` gives the state that the deltas of a new snapshot start from. For a merge snapshot that state is the combined state.

`src/dialects/postgres/folder.ts` reads the snapshot files of a migrations folder one time, runs the history rules and the status check, and gives the loaded folder: the snapshots by id in folder-name order, their files, and the ids of the leaves. `generate`, `check`, `pull` and the programmatic `reconstruct` use it. Its functions `stateOf` and `combinedState` call `reconstruct` and `startingState`, and they turn a failure into the `malformed` error that names the migration.

`applyDeltas` applies each delta through one call to the DDL engine in `src/dialects/dialect.ts`, which `ddlDiff` uses too. A `create` adds the entity. A `drop` removes that one entity and follows no edge. An `alter` or a `rename` goes through `update` for the entity that the key names. `ddlDiff` turns each rename decision into one rename delta with the `rename` method of the DDL, which applies the delta to the old state through the same `update`. A decision that changes nothing gives no delta. The final comparison of the two states gives the `create`, `drop` and `alter` deltas.

One set of rules covers a delta that does not fit the state. The rules are the same in a merge and outside a merge:

- A `drop`, an `alter` or a `rename` of a missing entity is skipped. A skipped rename changes no other entity.
- A `create` onto a taken key does nothing when the entity at that key is equal in all fields. It throws when a field differs.
- A `rename` that moves an entity onto a taken key throws. It also throws when it moves a referencing entity onto a taken key. An `alter` whose fields change the key behaves like a rename.

A merge needs the skip. Some changes store a delta and no statement, such as a jsonb default whose keys are written in another order. `check` compares only statements, so it finds no conflict between such a change and a table rename on another branch. If reconstruct applies the rename first, the delta names an entity that is missing under the old key. The diff for the merge snapshot then finds the change again. So in this case the combined state depends on which leaf is the first parent, and the state after the merge snapshot does not.

A delta that throws gives a `KeyCollisionError`. Its message names the entity of the delta, and it carries the id of the snapshot that holds the delta. `generate` turns it into a `check_error` of kind `malformed`. `up` turns it into a refusal for an old merge whose branches gave one key to two different entities.

### How `check` compares two branches

Example: `p1` is the base, and two git branches each add one migration on top of it.

```jsonc
// 20260101120001_init/snapshot.json
{ "type": "base", "version": "9", "dialect": "postgres", "id": "p1",
  "prevIds": ["00000000-0000-0000-0000-000000000000"], "ddl": [], "statements": [] }

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
2. For each snapshot in a branch, the check reads the stored `statements`. It runs no diff and reconstructs no state for them, so the result for an old migration does not depend on the current diff code. A custom migration stores no statements, and a base snapshot stores the create statements of its state.
3. Every statement of one branch is compared with every statement of the other. `buildFacetPaths` in `src/dialects/postgres/commutativity.ts` gives each statement the nodes that it writes, reads and shares a write of. Two statements conflict when one writes a node that the other writes or reads. A shared write conflicts with a write or a read, and never with another shared write: only a drop of a primary key, a unique constraint or a unique index shares a write of the uniqueness of its columns, which a new foreign key reads. One pair is left out: two equal stored statements whose SQL gives the same result on a second run (`isRepeatable`), because the facet paths name the object that a statement changes, and not what it changes the object to. A statement kind is repeatable only if every SQL statement that its writer can give runs a second time. So `alter_column` is not repeatable when it adds or drops an identity, drops a generated expression, creates or drops the sequence of a serial column, or changes a column between a scalar type and an array type. For that last change the user writes the conversion into the `USING` clause, so nothing says that it runs a second time.

   This comparison is one statement against one statement, and a statement does not know its migration. So a change that is stored as several statements is one change only if each statement is repeatable alone. A new expression for a generated column with a foreign key is stored as `drop_fk`, `recreate_column` and `create_fk`. The SQL of the three together runs a second time. `check` still reports the same three statements on two branches, because a `drop_fk` or a `create_fk` runs a second time only in the migration that also recreates the column. The same holds for the `create_index` or the `add_unique` that is stored for an index or a unique constraint of the column.

   A column has one node for each property: the type, the default, NOT NULL, the generation expression and the identity. An `alter_column` writes the nodes of the properties that its SQL changes, so `SET NOT NULL` on one branch passes with a new default or a new type on the other branch. A `recreate_enum` writes the type and the default of every column of its enum, because its SQL ends with `SET DATA TYPE` for each of these columns. So a removed enum value on one branch conflicts with a new type for such a column on the other branch: with the enum change as the last migration, the column would get its old type back.

   One facet rule reports a pair on purpose, although its SQL runs in either order with the same result. Without it, `check` would pass for a `DISABLE ROW LEVEL SECURITY` on one branch and a new policy for the same table on the other branch, and postgres would not enforce the policy until a later migration enables row level security again. So an `alter_rls` that disables writes `e|rls|schema.table`, and `create_policy` reads it. The same family has cases that the stored statements cannot show, and `check` passes for them: two branches that each drop a different policy of a table with two policies leave row level security on with no policy, and a branch that only changes a table with a policy between `pgTable()` and `pgTable.withRLS()` stores no statement. In each of these cases the next `generate` after the merge writes the missing statement.

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

The facet rules are also the source of the commutativity matrix. `tests/postgres/commutativity-matrix.json` is generated from them, and `tests/postgres/commutativity.matrix-gen.test.ts` fails when the two differ. The file has three fields:

- `types` lists the row names. A statement type has one row, and one more row for each variant that has other facet paths. `tests/postgres/commutativity-statements.ts` holds the statement of each row.
- `matrix` has one string of `0` and `1` for each row, in the order of `types`. A `1` means that the statement of the row conflicts with the statement of the column.
- `impossible` has the same layout. A `1` marks a conflict that no folder can have: one statement creates an object, and the other statement needs that object to exist at the fork point.

The file stores verdicts only. A rule change that keeps every verdict leaves no diff in the file. The same test writes the reason for each conflict to a JSON file for the visualizer page: `GEN_MATRIX=<out.json> pnpm vitest run tests/postgres/commutativity.matrix-gen.test.ts`.

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

When no branches conflict and several leaves are open, `detectNonCommutative` adds `commutativeBranches`: the statements of every leaf, diffed from the newest snapshot in the history of all leaves. `generate` replays these statements on that snapshot to get the state that the merge migration starts from.
