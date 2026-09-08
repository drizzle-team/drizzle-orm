# How commutativity works

`detectNonCommutative` function accepts an array of snapshots paths from a drizzle folder and a dialect we should use it for. Dialect is a param to dicsus, maybe we will have just different commutative function

It outputs an array of conflicts with a full info about each conflict

Hot this function works:

Input we will go through, 3 migrations, where 2 and 3 where creating the same table in different branches, which will cause a conflict

First migration
```json
{
  version: "8",
  dialect: "postgres",
  id: "p1",
  prevId: "00000000-0000-0000-0000-000000000000",
  ddl: [],
  renames: []
}
```

Second migration(done in branch1)
```json
{
  version: "8",
  dialect: "postgres",
  id: "a1",
  prevId: "p1",
  ddl: [
    {
      isRlsEnabled: false,
      name: "users",
      schema: "public",
      entityType: "tables"
    },
    {
      type: "varchar",
      options: null,
      typeSchema: "pg_catalog",
      notNull: false,
      dimensions: 0,
      default: null,
      generated: null,
      identity: null,
      name: "email",
      schema: "public",
      table: "users",
      entityType: "columns"
    }
  ],
  renames: []
}
```

Third migration(done in branch2)
```json
{
  version: "8",
  dialect: "postgres",
  id: "a1",
  prevId: "p1",
  ddl: [
    {
      isRlsEnabled: false,
      name: "users",
      schema: "public",
      entityType: "tables"
    },
    {
      type: "varchar",
      options: null,
      typeSchema: "pg_catalog",
      notNull: false,
      dimensions: 0,
      default: null,
      generated: null,
      identity: null,
      name: "email",
      schema: "public",
      table: "users",
      entityType: "columns"
    }
  ],
  renames: []
}
```



1. We are building a snapshots grapgh possible multi-child node in our migration tree

`buildSnapshotGraph` accepts all the snapshots as array and transform them to a Map and references between nodes:

```ts
nodes {
  p1: {
    id: 'p1',
    prevId: '00000000-0000-0000-0000-000000000000',
    path: '...',
    folderPath: '...',
    raw: {...} // raw snapshot json
  },
  a1: {
    id: 'a1',
    prevId: 'p1',
    path: '...',
    folderPath: '...',
    raw: {...} // raw snapshot json
  },
  b1: {
    id: 'b1',
    prevId: 'p1',
    path: '...',
    folderPath: '...',
    raw: {...} // raw snapshot json
  }
}
```

2. Next we need to actually map those nodes to a map of parent id to child ids to find if we have an array of >1 childs for each branch

`prevToChildren` is the exact map logic for it, it will output this:

```ts
prevToChildren {
  '00000000-0000-0000-0000-000000000000': [ 'p1' ],
  // Conflict!
  p1: [ 'a1', 'b1' ]
}
```

3. For each case where a key has >1 childs we need to check collisions

- We need to collect all the leaves for each branch child, so we can find a head and check each of branch node for collisions, if at least one is found - add a conflict with explanation

For our case we have both childs as a head, so we will have 
```ts
{ a1: [ 'a1' ], b1: [ 'b1' ] }
```

4. Conflicts cases are separated into several steps steps

- Firstly we identify same resources changes and same changes, then we identify same resources with different actions(create, drop, etc.)
- Then we identify conflicts when table drops and anything that is realted to this table was changed
- The same then will be done foe schemas(for dialects that supports schemas)
- Finally we will respond with an array of condlicts

Example, 
```ts
[
  {
    parentId: 'p1',
    parentPath: '...', // path to parent
    branchA: {
      headId: 'a1', // snapshot id
      path: '...', // path to snapshot json
      statements: [Array] // raw json statements
    },
    branchB: {
      headId: 'b1',
      path: '...',
      statements: [Array] 
    },
    reasons: [
      'Two identical operations on the same resource conflict (e.g., duplicate changes): table:public.users (create) vs table:public.users (create)'
    ]
  }
]
```

extra cases handled
```
--- case 1 ---
P1 - empty

A1 - create.users        B1 - create posts
A2 - create.posts        B2 - alter posts
                         B3 - create media
--- case 2 ---
P1 - users table

A1 - alter.users        B1 - create posts
A2 - alter.users        B2 - alter posts
                        B3 - drop users
```
