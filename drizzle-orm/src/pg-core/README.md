<div align='center'>
<h1>Drizzle ORM | PostgreSQL <a href=''><img alt='npm' src='https://img.shields.io/npm/v/drizzle-orm?label='></a></h1>
<img alt='npm' src='https://img.shields.io/npm/dm/drizzle-orm'>
<img alt='npm bundle size' src='https://img.shields.io/bundlephobia/min/drizzle-orm'>
<a href='https://discord.gg/yfjTbVXMW4'><img alt='Discord' src='https://img.shields.io/discord/1043890932593987624'></a>
<img alt='License' src='https://img.shields.io/npm/l/drizzle-orm'>
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

Drizzle ORM is a TypeScript ORM for SQL databases designed with maximum type safety in mind. It comes with a [drizzle-kit](https://github.com/drizzle-team/drizzle-kit-mirror) CLI companion for automatic SQL migrations generation. This is the documentation for Drizzle ORM version for PostgreSQL.

| Driver                                                                                           | Support |                                                |
|:-------------------------------------------------------------------------------------------------|:-------:|:----------------------------------------------:|
| [node-postgres](https://github.com/brianc/node-postgres)                                         |    ✅    |                                                |
| [postgres.js](https://github.com/porsager/postgres)                                              |    ✅    | [Docs](/drizzle-orm/src/postgres-js/README.md) |
| [NeonDB Serverless](https://github.com/neondatabase/serverless)                                  |    ✅    |                                                |
| [AWS Data API](https://github.com/aws/aws-sdk-js-v3/blob/main/clients/client-rds-data/README.md) |    ✅    |                                                |
| [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres/quickstart)                           |   ✅    |             |

## Installation

```bash
# npm
npm i drizzle-orm pg
npm i -D @types/pg drizzle-kit

# yarn
yarn add drizzle-orm pg
yarn add -D @types/pg drizzle-kit

# pnpm
pnpm add drizzle-orm pg
pnpm add -D @types/pg drizzle-kit
```

## SQL schema declaration

In Drizzle ORM, you declare SQL schema with TypeScript. You can either have a single `schema.ts` file with all declarations or you can group them logically in multiple files. We prefer to use single file schema.

### Single schema file example

```plaintext
📦 <project root>
 └ 📂 src
    └ 📂 db
       └ 📜schema.ts
```

### Multiple schema files example

```plaintext
📦 <project root>
 └ 📂 src
    └ 📂 db
       └ 📂 schema
          ├ 📜users.ts
          ├ 📜countries.ts
          ├ 📜cities.ts
          ├ 📜products.ts
          ├ 📜clients.ts
          ├ 📜enums.ts
          └ 📜etc.ts
```

## Quick start

```typescript
// schema.ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});
```

### Connect using node-postgres Pool (recommended)

```typescript
// db.ts
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { users } from './schema';

const pool = new Pool({
  connectionString: 'postgres://user:password@host:port/db',
});
// or
const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'db_name',
});

const db = drizzle(pool);

const allUsers = await db.select().from(users);
```

### Connect using node-postgres Client

```typescript
// db.ts
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';

import { users } from './schema';

const client = new Client({
  connectionString: 'postgres://user:password@host:port/db',
});
// or
const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'db_name',
});

await client.connect();

const db = drizzle(client);

const allUsers = await db.select().from(users);
```

### Connect using aws data api client

```typescript
import { drizzle, migrate } from 'drizzle-orm/aws-data-api/pg';

const rdsClient = new RDSDataClient({});

const db = drizzle(rdsClient, {
  database: '',
  secretArn: '',
  resourceArn: '',
});
```

### Connect to Vercel Postgres

```typescript
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql } from "@vercel/postgres";

const db = drizzle(sql);

db.select(...)
```

## Schema declaration

This is how you declare SQL schema in `schema.ts`. You can declare tables, indexes and constraints, foreign keys and enums. Please pay attention to `export` keyword, they are mandatory if you'll be using [drizzle-kit SQL migrations generator](#migrations).

```typescript
import { pgEnum, pgTable, serial, integer, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

// declaring enum in database
export const popularityEnum = pgEnum('popularity', ['unknown', 'known', 'popular']);

export const countries = pgTable('countries', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }),
}, (countries) => {
  return {
    nameIndex: uniqueIndex('name_idx').on(countries.name),
  }
});

export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }),
  countryId: integer('country_id').references(() => countries.id),
  popularity: popularityEnum('popularity'),
});
```

### Database and table entity types

```typescript
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { InferModel } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});

export type User = InferModel<typeof users>; // return type when queried
export type NewUser = InferModel<typeof users, 'insert'>; // insert type
...

// init node-postgres Pool or Client
const pool = new Pool(...);

export const db: NodePgDatabase = drizzle(pool);

const result: User[] = await db.select().from(users);

export async function insertUser(user: NewUser): Promise<User> {
  return db.insert(users).values(user).returning();
}
```

### Declaring indexes, foreign keys and composite primary keys

```typescript
import { foreignKey, index, uniqueIndex, integer, pgTable, serial, varchar, AnyPgColumn } from 'drizzle-orm/pg-core';

export const countries = pgTable('countries', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 256 }),
    population: integer('population'),
  }, (countries) => {
    return {
      nameIdx: index('name_idx').on(countries.name), // one column
      namePopulationIdx: index('name_population_idx').on(countries.name, countries.population), // multiple columns
      uniqueIdx: uniqueIndex('unique_idx').on(countries.name), // unique index
    }
  })
);

export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }),
  countryId: integer('country_id').references(() => countries.id), // inline foreign key
  countryName: varchar('country_name'),
  sisterCityId: integer('sister_city_id').references((): AnyPgColumn => cities.id), // self-referencing foreign key
}, (cities) => {
  return {
    // explicit foreign key with 1 column
    countryFk: foreignKey({
      columns: [cities.countryId],
      foreignColumns: [countries.id],
    }),
    // explicit foreign key with multiple columns
    countryIdNameFk: foreignKey({
      columns: [cities.countryId, cities.countryName],
      foreignColumns: [countries.id, countries.name],
    },
  }
});

export const cpkTable = pgTable('table', {
  column1: integer('column1').default(10).notNull(),
  column2: integer('column2'),
  column3: integer('column3'),
}, (table) => ({
  cpk: primaryKey(table.column1, table.column2),
}));

// Index declaration reference
index('name')
  .on(table.column1, table.column2, ...)
  .onOnly(table.column1, table.column2, ...)  
  .concurrently()
  .using(sql``) // sql expression
  .asc()
  .desc()
  .nullsFirst()
  .nullsLast()
  .where(sql``) // sql expression
```

### Customizing the table name

There is a "table creator" available, which allow you to customize the table name, for example, to add a prefix or suffix. This is useful if you need to have tables for different environments or applications in the same database.

> **Note:**: this feature should only be used to customize the table name. If you need to put the table into a different schema, refer to the [Table schemas](#table-schemas) section.

```ts
import { pgTableCreator } from 'drizzle-orm/pg-core';

const pgTable = pgTableCreator((name) => `myprefix_${name}`);

const users = pgTable('users', {
  id: int('id').primaryKey(),
  name: text('name').notNull(),
});
```

## Column types

The list of all column types. You can also create custom types - [see here](/docs/custom-types.md).

```typescript
export const popularityEnum = pgEnum('popularity', ['unknown', 'known', 'popular']); // declare enum type
popularityEnum('column_name'); // declare enum column

smallint('...');
integer('...');
bigint('...', { mode: 'number' | 'bigint' });

boolean('...');
text('...');
text('...', { enum: ['one', 'two', 'three'] });
varchar('...');
varchar('...', { enum: ['one', 'two', 'three'] });
varchar('...', { length: 256 }); // with length limit

serial('...');
bigserial('...', { mode: 'number' | 'bigint' });

decimal('...', { precision: 100, scale: 2 });
numeric('...', { precision: 100, scale: 2 });

real('...');
doublePrecision('...');

json('...').$type<...>();
json('...').$type<string[]>();
jsonb('...').$type<...>();
jsonb('...').$type<string[]>();

time('...');
time('...', { precision: 6, withTimezone: true });
timestamp('...');
timestamp('...', { mode: 'date' | 'string', precision: 0..6, withTimezone: true });
timestamp('...').defaultNow();
date('...');
date('...', { mode: 'string' | 'date' });
interval('...');
interval('...', { fields: 'day' | 'month' | '...' , precision: 0..6 });

column.primaryKey();
column.notNull();
column.default(...);
timeColumn.defaultNow();
uuidColumn.defaultRandom();

integer('...').array(3).array(4);
```

### Customizing column data type

Every column builder has a `.$type()` method, which allows you to customize the data type of the column. This is useful, for example, with branded types.

```ts
const users = pgTable('users', {
  id: serial('id').$type<UserId>().primaryKey(),
  jsonField: json('json_field').$type<Data>(),
});
```

## Table schemas

Drizzle won't append any schema before table definition by default. So if your tables are in `public` schema drizzle generate -> `select * from "users"`

But if you will specify any custom schema you want, then drizzle will generate -> `select * from "custom_schema"."users"`

> **Warning**
> If you will have tables with same names in different schemas then drizzle will respond with `never[]` error in result types and error from database
>
> In this case you may use [alias syntax](/drizzle-orm/src/pg-core/README.md#join-aliases-and-self-joins)

### Usage example

```typescript
// Table in default schema
const publicUsersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  verified: boolean('verified').notNull().default(false),
  jsonb: jsonb('jsonb').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// Table in custom schema
const mySchema = pgSchema('mySchema');

const usersTable = mySchema.table('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  verified: boolean('verified').notNull().default(false),
  jsonb: jsonb('jsonb').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

## Select, Insert, Update, Delete

### Select

Querying, sorting and filtering. We also support partial select.

```typescript
...
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, or } from 'drizzle-orm';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('full_name'),
});

const db = drizzle(...);

await db.select().from(users);
await db.select().from(users).where(eq(users.id, 42));

// you can combine filters with and(...) / or(...)
await db.select().from(users).where(and(eq(users.id, 42), eq(users.name, 'Dan')));

await db.select().from(users).where(or(eq(users.id, 42), eq(users.id, 1)));

// partial select
const result = await db.select({
    mapped1: users.id,
    mapped2: users.name,
  }).from(users);
const { mapped1, mapped2 } = result[0];

// limit, offset & order by
await db.select().from(users).limit(10).offset(10);
await db.select().from(users).orderBy(users.name);
await db.select().from(users).orderBy(desc(users.name));
// you can pass multiple order args
await db.select().from(users).orderBy(asc(users.name), desc(users.name));
```

#### Select from/join raw SQL

```typescript
await db.select({ x: sql<number>`x` }).from(sql`generate_series(2, 4) as g(x)`);

await db
  .select({
    x1: sql<number>`g1.x`,
    x2: sql<number>`g2.x`
  })
  .from(sql`generate_series(2, 4) as g1(x)`)
  .leftJoin(sql`generate_series(2, 4) as g2(x)`);
```

#### Conditionally select fields

```typescript
async function selectUsers(withName: boolean) {
  return db
    .select({
      id: users.id,
      ...(withName ? { name: users.name } : {}),
    })
    .from(users);
}

const users = await selectUsers(true);
```

#### WITH clause

```typescript
const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
const result = await db.with(sq).select().from(sq);
```

> **Note**: Keep in mind that if you need to select raw `sql` in a WITH subquery and reference that field in other queries, you must add an alias to it:

```typescript
const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users.name})`.as('name') }).from(users));
const result = await db.with(sq).select({ name: sq.name }).from(sq);
```

Otherwise, the field type will become `DrizzleTypeError` and you won't be able to reference it in other queries. If you ignore the type error and still try to reference the field, you will get a runtime error, because we cannot reference that field without an alias.

#### Select from subquery

```typescript
const sq = db.select().from(users).where(eq(users.id, 42)).as('sq');
const result = await db.select().from(sq);
```

Subqueries in joins are supported, too:

```typescript
const result = await db.select().from(users).leftJoin(sq, eq(users.id, sq.id));
```

#### List of all filter operators

```typescript
eq(column, value)
eq(column1, column2)
ne(column, value)
ne(column1, column2)

less(column, value)
lessEq(column, value)

gt(column, value)
gt(column1, column2)
gte(column, value)
gte(column1, column2)
lt(column, value)
lt(column1, column2)
lte(column, value)
lte(column1, column2)

isNull(column)
isNotNull(column)

inArray(column, values[])
inArray(column, sqlSubquery)
notInArray(column, values[])
notInArray(column, sqlSubquery)

exists(sqlSubquery)
notExists(sqlSubquery)

between(column, min, max)
notBetween(column, min, max)

like(column, value)
like(column, value)
ilike(column, value)
notIlike(column, value)

not(sqlExpression)

and(...expressions: SQL[])
or(...expressions: SQL[])
```

### Insert

```typescript
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { InferModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  createdAt: timestamp('created_at'),
});

type NewUser = InferModel<typeof users, 'insert'>;

const db = drizzle(...);

const newUser: NewUser = {
  name: 'Andrew',
  createdAt: new Date(),
};

await db.insert(users).values(newUser);

const insertedUsers/*: NewUser[]*/ = await db.insert(users).values(newUsers).returning();

const insertedUsersIds/*: { insertedId: number }[]*/ = await db.insert(users)
  .values(newUsers)
  .returning({ insertedId: users.id });
```

#### Insert several items

```ts
await db.insert(users)
  .values(
    {
      name: 'Andrew',
      createdAt: new Date(),
    },
    {
      name: 'Dan',
      createdAt: new Date(),
    },
  );
```

#### Insert array of items

```ts
const newUsers: NewUser[] = [
  {
      name: 'Andrew',
      createdAt: new Date(),
  },
  {
    name: 'Dan',
    createdAt: new Date(),
  },
];

await db.insert(users).values(newUsers);
```

### Upsert (Insert with on conflict statement)

```typescript
await db.insert(users)
  .values({ id: 1, name: 'Dan' })
  .onConflictDoUpdate({ target: users.id, set: { name: 'John' } });

await db.insert(users)
  .values({ id: 1, name: 'John' })
  .onConflictDoNothing();

await db.insert(users)
  .values({ id: 1, name: 'John' })
  .onConflictDoNothing({ target: users.id });

await db.insert(users)
  .values({ id: 1, name: 'John' })
  .onConflictDoUpdate({
    target: users.id,
    set: { name: 'John1' },
    where: sql`${users.createdAt} > '2023-01-01'::date`,
  });
```

### Update and Delete

```typescript
await db.update(users)
  .set({ name: 'Mr. Dan' })
  .where(eq(users.name, 'Dan'));

const updatedUser: InferModel<typeof users> = await db.update(users)
  .set({ name: 'Mr. Dan' })
  .where(eq(users.name, 'Dan'))
  .returning();

const updatedUserId: { updatedId: number }[] = await db.update(users)
  .set({ name: 'Mr. Dan' })
  .where(eq(users.name, 'Dan'))
  .returning({ updatedId: users.id });

await db.delete(users)
  .where(eq(users.name, 'Dan'));

const deletedUser: InferModel<typeof users> = await db.delete(users)
  .where(eq(users.name, 'Dan'))
  .returning();

const deletedUserId: { deletedId: number }[] = await db.delete(users)
  .where(eq(users.name, 'Dan'))
  .returning({ deletedId: users.id });
```

### Joins

> **Note**: for in-depth partial select joins documentation, refer to [this page](/docs/joins.md).

#### Many-to-one

```typescript
const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  cityId: integer('city_id').references(() => cities.id),
});

const result = db.select().from(cities).leftJoin(users, eq(cities.id, users.cityId));
```

#### Many-to-many

```typescript
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

const chatGroups = pgTable('chat_groups', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

const usersToChatGroups = pgTable('usersToChatGroups', {
  userId: integer('user_id').notNull().references(() => users.id),
  groupId: integer('group_id').notNull().references(() => chatGroups.id),
});

// querying user group with id 1 and all the participants(users)
const result = await db
  .select()
  .from(usersToChatGroups)
  .leftJoin(users, eq(usersToChatGroups.userId, users.id))
  .leftJoin(chatGroups, eq(usersToChatGroups.groupId, chatGroups.id))
  .where(eq(chatGroups.id, 1));
```

#### Join aliases and self-joins

```typescript
import { ..., alias } from 'drizzle-orm/pg-core';

export const files = pgTable('folders', {
  name: text('name').notNull(),
  parent: text('parent_folder')
})

const nestedFiles = alias(files, 'nested_files');

// will return files and folders and nested files for each folder at root dir
const result = await db
  .select()
  .from(files)
  .leftJoin(nestedFiles, eq(files.name, nestedFiles.name))
  .where(eq(files.parent, '/'));
```

#### Join using partial select

```typescript
// Select user ID and city ID and name
const result1 = await db
  .select({
    userId: users.id,
    cityId: cities.id,
    cityName: cities.name,
  })
  .from(cities)
  .leftJoin(users, eq(users.cityId, cities.id));

// Select all fields from users and only id and name from cities
const result2 = await db.select({
  user: users,
  city: {
    id: cities.id,
    name: cities.name,
  },
}).from(cities).leftJoin(users, eq(users.cityId, cities.id));
```

## Transactions

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values(newUser);
  await tx.update(users).set({ name: 'Mr. Dan' }).where(eq(users.name, 'Dan'));
  await tx.delete(users).where(eq(users.name, 'Dan'));
});
```

### Nested transactions

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values(newUser);
  await tx.transaction(async (tx2) => {
    await tx2.update(users).set({ name: 'Mr. Dan' }).where(eq(users.name, 'Dan'));
    await tx2.delete(users).where(eq(users.name, 'Dan'));
  });
});
```

### Transaction settings

```ts
interface PgTransactionConfig {
  isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
  accessMode?: 'read only' | 'read write';
  deferrable?: boolean;
}

await db.transaction(async (tx) => { ... }, {
  isolationLevel: 'read committed',
  accessMode: 'read write',
  deferrable: true,
});
```

## Query builder

Drizzle ORM provides a standalone query builder that allows you to build queries without creating a database instance.

```ts
import { queryBuilder as qb } from 'drizzle-orm/pg-core';

const query = qb.select().from(users).where(eq(users.name, 'Dan'));
const { sql, params } = query.toSQL();
```

## Views (WIP)

> **Warning**: views are currently only implemented on the ORM side. That means you can query the views that already exist in the database, but they won't be added to drizzle-kit migrations or `db push` yet.

There are two types of views in PostgreSQL: [regular](https://www.postgresql.org/docs/current/sql-createview.html) and [materialized](https://www.postgresql.org/docs/current/sql-creatematerializedview.html).

### Creating a view

```ts
import { pgView } from 'drizzle-orm/pg-core';

// regular view
const newYorkers = pgView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

// materialized view
const newYorkers = pgMaterializedView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));
```

#### Full view definition syntax

```ts
// regular view
const newYorkers = pgView('new_yorkers')
  .with({
    checkOption: 'cascaded',
    securityBarrier: true,
    securityInvoker: true,
  })
  .as((qb) => {
    const sq = qb
      .$with('sq')
      .as(
        qb.select({ userId: users.id, cityId: cities.id })
          .from(users)
          .leftJoin(cities, eq(cities.id, users.homeCity))
          .where(sql`${users.age1} > 18`),
      );
    return qb.with(sq).select().from(sq).where(sql`${users.homeCity} = 1`);
  });

// materialized view
const newYorkers2 = pgMaterializedView('new_yorkers')
  .using('btree')
  .with({
    fillfactor: 90,
    toast_tuple_target: 0.5,
    autovacuum_enabled: true,
    ...
  })
  .tablespace('custom_tablespace')
  .withNoData()
  .as((qb) => {
    const sq = qb
      .$with('sq')
      .as(
        qb.select({ userId: users.id, cityId: cities.id })
          .from(users)
          .leftJoin(cities, eq(cities.id, users.homeCity))
          .where(sql`${users.age1} > 18`),
      );
    return qb.with(sq).select().from(sq).where(sql`${users.homeCity} = 1`);
  });
```

> **Warning**: All the parameters inside the query will be inlined, instead of replaced by `$1`, `$2`, etc.

You can also use the [`queryBuilder` instance](#query-builder) directly instead of passing a callback, if you already have it imported.

```ts
import { queryBuilder as qb } from 'drizzle-orm/pg-core';

// regular view
const newYorkers = pgView('new_yorkers').as(qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

// materialized view
const newYorkers = pgMaterializedView('new_yorkers').as(qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));
```

### Using raw SQL in a view query

In case you need to specify the view query using a syntax that is not supported by the query builder, you can directly use SQL. In that case, you also need to specify the view shape.

```ts
// regular view
const newYorkers = pgView('new_yorkers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  cityId: integer('city_id').notNull(),
}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);

// materialized view
const newYorkers = pgMaterializedView('new_yorkers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  cityId: integer('city_id').notNull(),
}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);
```

### Describing existing views

There are cases when you are given readonly access to an existing view. In such cases you can just describe the view shape without specifying the query itself or using it in the migrations.

```ts
// regular view
const newYorkers = pgView('new_yorkers', {
  userId: integer('user_id').notNull(),
  cityId: integer('city_id'),
}).existing();

// materialized view won't make any difference in this case, but you can still use it for consistency
const newYorkers = pgMaterializedView('new_yorkers', {
  userId: integer('user_id').notNull(),
  cityId: integer('city_id'),
}).existing();
```

### Refreshing materialized views

```ts
await db.refreshMaterializedView(newYorkers);

await db.refreshMaterializedView(newYorkers).concurrently();

await db.refreshMaterializedView(newYorkers).withNoData();
```

## Prepared statements

```typescript
const query = db.select().from(users).where(eq(users.name, 'Dan')).prepare();

const result = await query.execute();
```

### Parametrized queries

```typescript
import { placeholder } from 'drizzle-orm/pg-core';

const query = db.select().from(users).where(eq(users.name, placeholder('name'))).prepare();

const result = await query.execute({ name: 'Dan' });
```

## Raw queries execution

If you have some complex queries to execute and drizzle-orm can't handle them yet, you can use the `db.execute` method to execute raw queries.

```typescript
// it will automatically run a parametrized query!
const res/*: QueryResult<{ id: number; name: string }>*/ = await db.execute<
  { id: number; name: string }
>(sql`select * from ${users} where ${users.id} = ${userId}`);
```

## Migrations

### Automatic SQL migrations generation with drizzle-kit

[Drizzle Kit](https://www.npmjs.com/package/drizzle-kit) is a CLI migrator tool for Drizzle ORM. It is probably one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.

Check out the [docs for Drizzle Kit](https://github.com/drizzle-team/drizzle-kit-mirror)

For schema file:

```typescript
import { index, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  fullName: varchar('full_name', { length: 256 }),
}, (users) => ({
  nameIdx: index('name_idx').on(users.fullName),
}));

export const authOtps = pgTable('auth_otp', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 256 }),
  userId: integer('user_id').references(() => users.id),
});
```

It will generate:

```SQL
CREATE TABLE IF NOT EXISTS auth_otp (
  'id' SERIAL PRIMARY KEY,
  'phone' character varying(256),
  'user_id' INT
);

CREATE TABLE IF NOT EXISTS users (
  'id' SERIAL PRIMARY KEY,
  'full_name' character varying(256)
);

DO $$ BEGIN
 ALTER TABLE auth_otp ADD CONSTRAINT auth_otp_user_id_fkey FOREIGN KEY ('user_id') REFERENCES users(id);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS users_full_name_index ON users (full_name);
```

And you can run migrations manually or using our embedded migrations module

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://user:password@host:port/db',
});
const db = drizzle(pool);

// this will automatically run needed migrations on the database
await migrate(db, { migrationsFolder: './drizzle' });
```

## Logging

To enable default query logging, just pass `{ logger: true }` to the `drizzle` function:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle(pool, { logger: true });
```

You can change the logs destination by creating a `DefaultLogger` instance and providing a custom `writer` to it:

```typescript
import { DefaultLogger, LogWriter } from 'drizzle-orm/logger';
import { drizzle } from 'drizzle-orm/node-postgres';

class MyLogWriter implements LogWriter {
  write(message: string) {
    // Write to file, console, etc.
  }
}

const logger = new DefaultLogger({ writer: new MyLogWriter() });

const db = drizzle(pool, { logger });
```

You can also create a custom logger:

```typescript
import { Logger } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

class MyLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    console.log({ query, params });
  }
}

const db = drizzle(pool, { logger: new MyLogger() });
```

## Table introspect API

See [dedicated docs](/docs/table-introspect-api.md).
