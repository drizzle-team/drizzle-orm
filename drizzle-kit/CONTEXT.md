# Drizzle Kit migrations

How drizzle-kit records the schema history of a migrations folder, so that it can generate the next migration and check whether branches of that history can merge.

## Language

### Snapshots

**Snapshot**:
The `snapshot.json` file in one migration folder. It records the schema side of that migration.
_Avoid_: journal entry, meta file

**Delta format**:
The snapshot design in which a folder has one base snapshot and every later snapshot is a diff snapshot. It is format 9 for postgres and format 2 for cockroach.
_Avoid_: format 9, when the sentence is not only about postgres

**Full-state format**:
The older snapshot design in which every snapshot holds a full state, and check compares two lists of key strings for each statement. Mysql, sqlite, turso and mssql use it.

**Delta format snapshot**:
A snapshot in the delta format: a base snapshot or a diff snapshot.
_Avoid_: delta snapshot

**Full-state format snapshot**:
A snapshot in the full-state format. A base snapshot also holds a full state, but it is a delta format snapshot.
_Avoid_: full-state snapshot, legacy snapshot

**Base snapshot**:
A snapshot that holds a full state and the footprints of its migration. A folder has one base snapshot, which is its first snapshot.
_Avoid_: root snapshot, full snapshot

**Diff snapshot**:
A snapshot that holds the deltas and the footprints of one migration. The deltas of a snapshot with one parent start from that parent's state. The deltas of a merge snapshot start from its combined state.
_Avoid_: delta snapshot, snapshot delta

**Parent**:
A snapshot that another snapshot directly follows. A snapshot has one parent, or several when it is a merge snapshot.
_Avoid_: previous snapshot, prev

**First parent**:
The first of a snapshot's parents. For a merge snapshot it is the leaf with the newest folder name, and the combined state starts from its state.

**Combined state**:
The state that a merge snapshot's deltas start from: the first parent's state, plus the deltas of the rest of the merge's history, applied in folder-name order.
_Avoid_: merged state, merge base

**Ancestor**:
A snapshot that is reached from another snapshot by following parents back, one or more steps. Its migration always runs before the other snapshot's migration.

**History**:
A snapshot together with all its ancestors. It is the set of migrations that a database has run once it reaches that snapshot.
_Avoid_: lineage, chain

**Fork point**:
The latest snapshot that is an ancestor of every leaf of a fork.
_Avoid_: anchor, LCA, base (a base snapshot is something else)

**Branch**:
The snapshots in one leaf's history that are missing from another leaf's history. A branch can contain snapshots that are not descendants of the fork point, when they reached the leaf through a merge.
_Avoid_: side

**Leaf**:
A snapshot that no other snapshot follows. A folder has several leaves after git branches that each added a migration are merged.
_Avoid_: head, tip, latest snapshot

**Merge snapshot**:
A snapshot with more than one parent. It joins the leaves of a folder into one history again.
_Avoid_: merge node

**Merge migration**:
The migration whose snapshot is a merge snapshot: the migration folder as a whole, or its SQL file. Say "merge snapshot" when the sentence is about the snapshot itself.

**State**:
The full set of schema entities at one snapshot.
_Avoid_: full DDL, materialized snapshot

**Reconstruct**:
Build the state of a snapshot from the base snapshot and the deltas that follow it.
_Avoid_: materialize, replay

**Drift**:
A difference between the state that reconstruct gives for a snapshot and the state that the snapshot had when it was written. A later drizzle-kit version causes a drift when that version reconstructs in another way.
_Avoid_: schema change (the schema files differ from the migrations)

### Changes

**Delta**:
One stored change to a state: the create, drop, alter or rename of one entity. A delta names that entity by the key of the entity.
_Avoid_: structural diff, structural delta, keyed delta

**Rename**:
A delta that changes the key of an entity because the user decided to rename or move that entity. Through the edges, a rename also changes the entities that reference the renamed entity, and those entities get no delta of their own.
_Avoid_: rename hint (a hint is the input to that decision)

**Edge**:
A rule that says which fields of one entity type hold the key of another entity, such as the schema and table of a column. An edge can have a condition that limits it to some entities of the type.
_Avoid_: reference rule, relation

**Statement**:
One schema change with its meaning, such as a column rename or a new index, that becomes SQL in a migration. A snapshot does not store its statements. It stores one footprint for each of them.
_Avoid_: alteration statement, alter

**Footprint**:
What one statement writes or reads in a schema, as lists of nodes: the nodes that it changes, the nodes that must exist for it, and the nodes that it shares with other statements. A footprint also names the kind and the target of its statement. Check reports a conflict when a footprint of one branch writes a node that a footprint of the other branch reads, writes or shares. A shared write also conflicts with a read, and two shared writes of one node do not conflict. Two reads never conflict. Two footprints of the same idempotent change on two branches do not conflict with each other. In the older check of mysql and sqlite, a footprint is two lists of key strings: the keys that a statement produces and the keys that it conflicts with.
_Avoid_: claim, facet paths

**Node**:
One part of a schema object that a footprint names. Every object has three nodes: a self node, a name node and an existence node. An alter writes only the self node, a rename writes the name node, and a create or a drop writes all three. So a statement that only reads the name of a column does not conflict with an alter of that column.
_Avoid_: facet
