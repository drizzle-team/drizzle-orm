# Drizzle Seed

## Documentation

The full API reference and package overview can be found in our [official documentation](https://orm.drizzle.team/docs/seed-overview)

## Overview

`drizzle-seed` is a TypeScript library that helps you generate deterministic, yet realistic,
fake data to populate your database. By leveraging a seedable pseudorandom number generator (pRNG),
it ensures that the data you generate is consistent and reproducible across different runs.
This is especially useful for testing, development, and debugging purposes.

#### What is Deterministic Data Generation?

Deterministic data generation means that the same input will always produce the same output.
In the context of `drizzle-seed`, when you initialize the library with the same seed number,
it will generate the same sequence of fake data every time. This allows for predictable and repeatable data sets.

#### Pseudorandom Number Generator (pRNG)

A pseudorandom number generator is an algorithm that produces a sequence of numbers
that approximates the properties of random numbers. However, because it's based on an initial value
called a seed, you can control its randomness. By using the same seed, the pRNG will produce the
same sequence of numbers, making your data generation process reproducible.

#### Benefits of Using a pRNG:

- Consistency: Ensures that your tests run on the same data every time.
- Debugging: Makes it easier to reproduce and fix bugs by providing a consistent data set.
- Collaboration: Team members can share seed numbers to work with the same data sets.

With drizzle-seed, you get the best of both worlds: the ability to generate realistic fake data and the control to reproduce it whenever needed.

## Getting started

`npm install drizzle-seed`

You have to install `drizzle-orm` in order to use `drizzle-seed`.

`npm install drizzle-orm`

## Basic Usage

In this example we will create 10 users with random names and ids

```ts {12}
import { pgTable, integer, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { seed } from "drizzle-seed";

const users = pgTable("users", {
  id: integer().primaryKey(),
  name: text().notNull(),
});

async function main() {
  const db = drizzle(process.env.DATABASE_URL!);
  await seed(db, { users });
}

main();
```

## Options

**`count`**

By default, the `seed` function will create 10 entities.
However, if you need more for your tests, you can specify this in the seed options object

```ts
await seed(db, schema, { count: 1000 });
```

**`seed`**

If you need a seed to generate a different set of values for all subsequent runs, you can define a different number
in the `seed` option. Any new number will generate a unique set of values

```ts
await seed(db, schema, { seed: 12345 });
```

## Relations

`drizzle-seed` links tables together so that a foreign key column is always filled with a value that exists in the
table it points at. It picks those links up from foreign key constraints, and from relations declared with
`defineRelations` - which is what makes it work on schemas that have no foreign keys in the database at all.

A database created with its relations already knows about them, so nothing has to be passed to `seed`:

```ts
import * as schema from "./schema.ts";
import { relations } from "./relations.ts";

const db = drizzle(process.env.DATABASE_URL!, { relations });

await seed(db, schema);
```

Relations can also be handed to `seed` directly, which takes precedence over the ones on the database:

```ts
await seed(db, schema, { relations });
```

Many-to-many relations declared with `.through()` are followed as well: the junction table is filled with rows that
reference both of the tables it joins.

```ts
export const relations = defineRelations(schema, (r) => ({
  users: {
    groups: r.many.groups({
      from: r.users.id.through(r.usersToGroups.userId),
      to: r.groups.id.through(r.usersToGroups.groupId),
    }),
  },
}));
```

Note that `defineRelations` does not record which side of a relation holds the foreign key, so when no foreign key
constraint backs it, `drizzle-seed` infers the direction: the side whose columns are a primary key or a unique
constraint is the one being referenced. A relation that joins two columns that are neither is skipped with a warning,
since there is no containment for the seeder to reproduce.

## Generating data without writing it

`dryRun` runs the whole generation and hands you the result instead of writing it. No query is issued - the database is
only used to tell which dialect to generate for.

```ts
const data = await seed(db, schema, { count: 5 }).dryRun();

data.users; // [{ id: 1, name: "Melanie" }, ...]
data.posts; // [{ id: 1, ownerId: 1, title: "..." }, ...]
```

The rows are exactly the ones a real `seed` with the same `seed` number would have written, relations included, and
`refine` works the same way:

```ts
const data = await seed(db, schema)
  .refine((funcs) => ({
    users: { count: 3, columns: { name: funcs.firstName() } },
  }))
  .dryRun();
```

### As SQL

`output: "sql"` gives you the statements a seed would run, with their values written into them, so they can be saved
and replayed anywhere:

```ts
const statements = await seed(db, schema, { count: 5 }).dryRun({ output: "sql" });

// [`insert into "users" ("id", "name") values (1, 'Melanie'), (2, 'Kurt')`, ...]

fs.writeFileSync("seed.sql", statements.join(";\n") + ";");
```

They are the same statements a real seed executes, batched the same way, and they include everything the seed does:
the second pass that fills in the columns of tables that reference each other, and the sequence synchronisation
postgres needs after rows are written with explicit ids.

## Reset databases

With `drizzle-seed`, you can easily reset your database and seed it with new values, for example, in your test suites

```ts
// path to a file with schema you want to reset
import * as schema from "./schema.ts";
import { reset } from "drizzle-seed";

async function main() {
  const db = drizzle(process.env.DATABASE_URL!);
  await reset(db, schema);
}

main();
```

More examples are available in our [official documentation](https://orm.drizzle.team/docs/seed-overview)