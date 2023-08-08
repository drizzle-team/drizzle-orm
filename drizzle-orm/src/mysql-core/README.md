<div align='center'>
<h1>Drizzle ORM | MySQL <a href=''><img alt='npm' src='https://img.shields.io/npm/v/drizzle-orm?label='></a></h1>
<img alt='npm' src='https://img.shields.io/npm/dm/drizzle-orm'>
<img alt='Driver version' src='https://img.shields.io/npm/dependency-version/drizzle-orm/peer/mysql2'>
<img alt='npm bundle size' src='https://img.shields.io/bundlephobia/min/drizzle-orm'>
<a href='https://discord.gg/yfjTbVXMW4'><img alt='Discord' src='https://img.shields.io/discord/1043890932593987624'></a>
<img alt='NPM' src='https://img.shields.io/npm/l/drizzle-orm'>
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

Drizzle ORM is a TypeScript ORM for SQL databases designed with maximum type safety in mind. It comes with a [drizzle-kit](https://github.com/drizzle-team/drizzle-kit-mirror) CLI companion for automatic SQL migrations generation. This is the documentation for Drizzle ORM version for MySQL.

| Driver                                                               | Support |
|:---------------------------------------------------------------------|:-------:|
| [mysql2](https://github.com/sidorares/node-mysql2)                   |    ✅    |
| [Planetscale Serverless](https://github.com/planetscale/database-js) |    ✅    |

## Installation

```bash
# npm
npm i drizzle-orm mysql2
npm i -D drizzle-kit

# yarn
yarn add drizzle-orm mysql2
yarn add -D drizzle-kit

# pnpm
pnpm add drizzle-orm mysql2
pnpm add -D drizzle-kit
```

## SQL schema declaration

With `drizzle-orm` you declare SQL schema in TypeScript. You can have either one `schema.ts` file with all declarations or you can group them logically in multiple files. We prefer to use single file schema.

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
import { mysqlTable, serial, text, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});
```

### Using Drizzle ORM in Next.js app router

In order to use Drizzle ORM in the Next.js new app router mode you have to add `mysql2` dependendency to the `experimental.serverComponentsExternalPackages` array in `next.config.js` config file.

Example `next.config.js` should look like this:

```ts
/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
    serverComponentsExternalPackages: ["mysql2"],
  },
}
export default config
```

More details about `serverComponentsExternalPackages` can be found in the [Next.js beta docs](https://beta.nextjs.org/docs/api-reference/next-config#servercomponentsexternalpackages).

> **Note**: New next.js beta docs changes frequently so if the link above doesn't work try this one: [Next.js beta docs](https://beta.nextjs.org/docs/api-reference/next-config.js#servercomponentsexternalpackages).

### Connect using mysql2 Pool (recommended)

```typescript
// db.ts
import { drizzle } from 'drizzle-orm/mysql2';

import mysql from 'mysql2/promise';
import { users } from './schema';

// create the connection
const poolConnection = mysql.createPool({
  host: 'localhost',
  user: 'root',
  database: 'test',
});

const db = drizzle(poolConnection);

const allUsers = await db.select().from(users);
```

### Connect using mysql2 Client

```typescript
// db.ts
import { drizzle } from 'drizzle-orm/mysql2';

import mysql from 'mysql2/promise';
import { users } from './schema';

// create the connection
const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  database: 'test',
});

const db = drizzle(connection);

const allUsers = await db.select().from(users);
```

### Connect using PlanetScale Serverless client

```typescript
// db.ts
import { drizzle } from 'drizzle-orm/planetscale-serverless';

import { connect } from '@planetscale/database';
import { users } from './schema';

// create the connection
const connection = connect({
  host: process.env['DATABASE_HOST'],
  username: process.env['DATABASE_USERNAME'],
  password: process.env['DATABASE_PASSWORD'],
});

const db = drizzle(connection);

const allUsers = await db.select().from(users);
```

## Schema declaration

This is how you declare SQL schema in `schema.ts`. You can declare tables, indexes and constraints, foreign keys and enums. Please pay attention to `export` keyword, they are mandatory if you'll be using [drizzle-kit SQL migrations generator](#migrations).

```typescript
// db.ts
import {
  int,
  mysqlEnum,
  mysqlTable,
  serial,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

// declaring enum in database
export const countries = mysqlTable('countries', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }),
}, (countries) => ({
  nameIndex: uniqueIndex('name_idx').on(countries.name),
}));

export const cities = mysqlTable('cities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }),
  countryId: int('country_id').references(() => countries.id),
  popularity: mysqlEnum('popularity', ['unknown', 'known', 'popular']),
});
```

### Database and table entity types

```typescript
// db.ts
import { MySqlDatabase, mysqlTable, serial, text, varchar } from 'drizzle-orm/mysql-core';
import { InferModel } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { drizzle, MySqlRawQueryResult } from 'drizzle-orm/mysql2';

const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});

export type User = InferModel<typeof users>; // return type when queried
export type NewUser = InferModel<typeof users, 'insert'>; // insert type
...

// init mysql2 Pool or Client
const poolConnection = mysql.createPool({
    host:'localhost', 
    user: 'root',
    database: 'test'
});

export const db: MySqlDatabase = drizzle(poolConnection);

const result: User[] = await db.select().from(users);

/* type MySqlRawQueryExample is a response from mysql2 driver
   type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];
   type ResultSetHeader = {
      affectedRows: number;
      fieldCount: number;
      info: string;
      insertId: number;
      serverStatus: number;
      warningStatus: number;
      changedRows?: number;
    }
*/
export async function insertUser(user: NewUser): Promise<MySqlRawQueryResult> {
  return db.insert(users).values(user);
}
```

### Declaring indexes, foreign keys and composite primary keys

```typescript
// db.ts
import { foreignKey, index, int, mysqlTable, serial, uniqueIndex, varchar, AnyMySqlColumn } from 'drizzle-orm/mysql-core';

export const countries = mysqlTable('countries', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 256 }),
    population: int('population'),
  }, (table) => ({
    nameIdx: index('name_idx').on(table.name), // one column
    namePopulationIdx: index('name_population_idx').on(table.name, table.population), // multiple columns
    uniqueIdx: uniqueIndex('unique_idx').on(table.name), // unique index
  })
);

export const cities = mysqlTable('cities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }),
  countryId: int('country_id').references(() => countries.id), // inline foreign key
  countryName: varchar('country_id', { length: 256 }),
  sisterCityId: int('sister_city_id').references((): AnyMySqlColumn => cities.id), // self-referencing foreign key
}, (cities) => ({
  // explicit foreign key with 1 column
  countryFk: foreignKey(({
    columns: [cities.countryId],
    foreignColumns: [countries.id],
  })),
  // explicit foreign key with multiple columns
  countryIdNameFk: foreignKey(({
    columns: [cities.countryId, cities.countryName],
    foreignColumns: [countries.id, countries.name],
  })),
}));

export const cpkTable = mysqlTable('table', {
  simple: int('simple'),
  columnNotNull: int('column_not_null').notNull(),
  columnDefault: int('column_default').default(100),
}, (table) => ({
  cpk: primaryKey(table.simple, table.columnDefault),
}));

// Index declaration reference
index('name_idx')
    .on(table.column1, table.column2, ...)
    .using('btree' | 'hash')
    .lock('default' | 'none' | 'shared' | 'exclusive')
    .algorythm('default' | 'inplace' | 'copy')
```

### Customizing the table name

There are "table creators" available for each dialect, which allow you to customize the table name, for example, to add a prefix or suffix. This is useful if you need to have tables for different environments or applications in the same database.

> **Note:**: this feature should only be used to customize the table name. If you need to put the table into a different schema, refer to the [Table schemas](#table-schemas) section.

```ts
import { mysqlTableCreator } from 'drizzle-orm/mysql-core';

const mysqlTable = mysqlTableCreator((name) => `myprefix_${name}`);

const users = mysqlTable('users', {
  id: int('id').primaryKey(),
  name: text('name').notNull(),
});
```

## Column types

The list of all column types. You can also create custom types - [see here](https://github.com/drizzle-team/drizzle-orm/blob/main/docs/custom-types.md).

```typescript
mysqlEnum('popularity', ['unknown', 'known', 'popular'])

int('...');
tinyint('name');
smallint('name');
mediumint('name');
bigint('...', { mode: 'number' });

real('name', { precision: 1, scale: 1 });
decimal('name', { precision: 1, scale: 1 });
double('name', { precision: 1, scale: 1 });
float('name',);

serial('name');

binary('name');
varbinary('name', { length: 2 });

char('name');
varchar('name', { length: 2, enum: ['a', 'b'] });
text('name', { enum: ['a', 'b'] });

boolean('name');

date('...');
datetime('...', { mode: 'date' | 'string', fsp: 0..6 });
time('...', { mode: 'date' | 'string', fsp: 0..6 });
year('...');

timestamp('name');
timestamp('...', { mode: 'date' | 'string', fsp: 0..6 })
timestamp('...').defaultNow()

json('name');
json('name').$type<string[]>();
```

### Customizing column data type

Every column builder has a `.$type()` method, which allows you to customize the data type of the column. This is useful, for example, with branded types.

```ts
const users = mysqlTable('users', {
  id: serial('id').$type<UserId>().primaryKey(),
  jsonField: json('json_field').$type<Data>(),
});
```

## Table schemas

> **Warning**
> If you have tables with same names in different schemas, Drizzle will set result types to `never[]` and return an error from the database.
>
> In this case you may use [alias syntax](/drizzle-orm/src/mysql-core/README.md#join-aliases-and-self-joins).

---

Usage example

```typescript
// Table in default schema
const publicUsersTable = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  verified: boolean('verified').notNull().default(false),
  jsonb: json<string[]>('jsonb'),
  createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

// Table in custom schema
const mySchema = mysqlSchema('mySchema');

const mySchemaUsersTable = mySchema('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  verified: boolean('verified').notNull().default(false),
  jsonb: json<string[]>('jsonb'),
  createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});
```

## Select, Insert, Update, Delete

### Select

Querying, sorting and filtering. We also support partial select.

```typescript
...
import { mysqlTable, serial, text, varchar } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
import { and, asc, desc, eq, or } from 'drizzle-orm';

const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: text('full_name'),
});

const db = drizzle(...);

await db.select().from(users);
await db.select().from(users).where(eq(users.id, 42));

// you can combine filters with and(...) / or(...)
await db.select().from(users).where(and(eq(users.id, 42), eq(users.name, 'Dan')));

await db.select().from(users)
  .where(or(eq(users.id, 42), eq(users.id, 1)));

// partial select
const result = await db
  .select({
    mapped1: users.id,
    mapped2: users.name,
  })
  .from(users);
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
await db.select({ x: sql<number>`x` }).from(sql`(select 1) as t(x)`);

await db
  .select({
    x1: sql<number>`g1.x`,
    x2: sql<number>`g2.x`
  })
  .from(sql`(select 1) as g1(x)`)
  .leftJoin(sql`(select 2) as g2(x)`);
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

#### Querying large datasets

If you need to return a very large amount of rows from a query and you don't want to load them all into memory, you can use `.iterator()` to convert the query into an async iterator:

```typescript
const iterator = await db.select().from(users).iterator();
for await (const row of iterator) {
  console.log(row);
}
```

It also works with prepared statements:

```typescript
const query = await db.select().from(users).prepare();
const iterator = await query.iterator();
for await (const row of iterator) {
  console.log(row);
}
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
notLike(column, value)

not(sqlExpression)

and(...expressions: SQL[])
or(...expressions: SQL[])

```

### Insert

```typescript
import { mysqlTable, serial, text, timestamp } from 'drizzle-orm/mysql-core';
import { InferModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';

const users = mysqlTable('users', {
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

### Update and Delete

```typescript
await db.update(users)
  .set({ name: 'Mr. Dan' })
  .where(eq(users.name, 'Dan'));

await db.delete(users)
  .where(eq(users.name, 'Dan'));
```

### Joins

> **Note**: for in-depth partial select joins documentation, refer to [this page](/docs/joins.md).

#### Many-to-one

```typescript
const cities = mysqlTable('cities', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  cityId: int('city_id').references(() => cities.id),
});

const result = db.select().from(cities).leftJoin(users, eq(cities.id, users.cityId));
```

#### Many-to-many

```typescript
const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

const chatGroups = mysqlTable('chat_groups', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

const usersToChatGroups = mysqlTable('usersToChatGroups', {
  userId: int('user_id').notNull().references(() => users.id),
  groupId: int('group_id').notNull().references(() => chatGroups.id),
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
import { ..., alias } from 'drizzle-orm/mysql-core';

export const files = mysqlTable('folders', {
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
  .from(cities).leftJoin(users, eq(users.cityId, cities.id));

// Select all fields from users and only id and name from cities
const result2 = await db
  .select({
    user: users,
    city: {
      id: cities.id,
      name: cities.name,
    },
  })
  .from(cities).leftJoin(users, eq(users.cityId, cities.id));
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
interface MySqlTransactionConfig {
  withConsistentSnapshot?: boolean;
  accessMode?: 'read only' | 'read write';
  isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

await db.transaction(async (tx) => { ... }, {
  withConsistentSnapshot: true,
  accessMode: 'read only',
  isolationLevel: 'read committed',
});
```

## Query builder

Drizzle ORM provides a standalone query builder that allows you to build queries without creating a database instance.

```ts
import { queryBuilder as qb } from 'drizzle-orm/mysql-core';

const query = qb.select().from(users).where(eq(users.name, 'Dan'));
const { sql, params } = query.toSQL();
```

## Views (WIP)

> **Warning**: views are currently only implemented on the ORM side. That means you can query the views that already exist in the database, but they won't be added to drizzle-kit migrations or `db push` yet.

### Creating a view

```ts
import { mysqlView } from 'drizzle-orm/mysql-core';

const newYorkers = mysqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));
```

#### Full view definition syntax

```ts
const newYorkers = mysqlView('new_yorkers')
  .algorithm('merge')
  .definer('root@localhost')
  .sqlSecurity('definer')
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
import { queryBuilder as qb } from 'drizzle-orm/mysql-core';

const newYorkers = mysqlView('new_yorkers').as(qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));
```

### Using raw SQL in a view query

In case you need to specify the view query using a syntax that is not supported by the query builder, you can directly use SQL. In that case, you also need to specify the view shape.

```ts
const newYorkers = mysqlView('new_yorkers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  cityId: int('city_id').notNull(),
}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);
```

### Describing existing views

There are cases when you are given readonly access to an existing view. In such cases you can just describe the view shape without specifying the query itself or using it in the migrations.

```ts
const newYorkers = mysqlView('new_yorkers', {
  userId: int('user_id').notNull(),
  cityId: int('city_id'),
}).existing();
```

## Prepared statements

```typescript
const query = db.select().from(users).where(eq(users.name, 'Dan')).prepare();

const result = await query.execute();
```

### Prepared statements with parameters

```typescript
import { placeholder } from 'drizzle-orm/mysql-core';

const query = db.select().from(users).where(eq(users.name, placeholder('name'))).prepare();

const result = await query.execute({ name: 'Dan' });
```

## Raw queries execution

If you have some complex queries to execute and drizzle-orm can't handle them yet, you can use the `db.execute` method to execute raw queries.

```typescript
// it will automatically run a parametrized query!
const res: MySqlQueryResult<{ id: number; name: string }> = await db.execute<
  { id: number; name: string }
>(sql`select * from ${users} where ${users.id} = ${userId}`);
```

## Migrations

### Automatic SQL migrations generation with drizzle-kit

[Drizzle Kit](https://www.npmjs.com/package/drizzle-kit) is a CLI migrator tool for Drizzle ORM. It is probably one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.

Check out the [docs for Drizzle Kit](https://github.com/drizzle-team/drizzle-kit-mirror)

For schema file:

```typescript
import { index, int, mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  fullName: varchar('full_name', { length: 256 }),
}, (users) => ({
  nameIdx: index('name_idx').on(users.fullName),
}));

export const authOtps = mysqlTable('auth_otp', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 256 }),
  userId: int('user_id').references(() => users.id),
});
```

It will generate:

```SQL
CREATE TABLE `users` (
 `id` int PRIMARY KEY,
 `full_name` varchar(256)
);


CREATE TABLE `auth_otp` (
 `id` serial PRIMARY KEY,
 `phone` varchar(256),
 `user_id` int
);


ALTER TABLE auth_otp ADD CONSTRAINT auth_otp_user_id_users_id_fk FOREIGN KEY (`user_id`) REFERENCES users(`id`) ;
CREATE INDEX name_idx ON users (`full_name`);
```

And you can run migrations manually or using our embedded migrations module

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';

// create the connection
const poolConnection = mysql.createPool({
  host: 'localhost',
  user: 'root',
  database: 'test',
  multipleStatements: true,
});

const db = drizzle(poolConnection);

// this will automatically run needed migrations on the database
await migrate(db, { migrationsFolder: './drizzle' });
```

## Logging

To enable default query logging, just pass `{ logger: true }` to the `drizzle` function:

```typescript
import { drizzle } from 'drizzle-orm/mysql2';

const db = drizzle(pool, { logger: true });
```

You can change the logs destination by creating a `DefaultLogger` instance and providing a custom `writer` to it:

```typescript
import { DefaultLogger, LogWriter } from 'drizzle-orm/logger';
import { drizzle } from 'drizzle-orm/mysql2';

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
import { drizzle } from 'drizzle-orm/mysql2';

class MyLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    console.log({ query, params });
  }
}

const db = drizzle(pool, { logger: new MyLogger() });
```

## Table introspect API

See [dedicated docs](/docs/table-introspect-api.md).
