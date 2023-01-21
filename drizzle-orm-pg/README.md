<div align='center'>
<h1>Drizzle ORM | PostgreSQL <a href=''><img alt='npm' src='https://img.shields.io/npm/v/drizzle-orm-pg?label='></a></h1>
<img alt='npm' src='https://img.shields.io/npm/dm/drizzle-orm-pg'>
<img alt='npm bundle size' src='https://img.shields.io/bundlephobia/min/drizzle-orm-pg'>
<a href='https://discord.gg/yfjTbVXMW4'><img alt='Discord' src='https://img.shields.io/discord/1043890932593987624'></a>
<img alt='License' src='https://img.shields.io/npm/l/drizzle-orm-pg'>
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

Drizzle ORM is a TypeScript ORM for SQL databases designed with maximum type safety in mind. It comes with a [drizzle-kit](https://github.com/drizzle-team/drizzle-kit-mirror) CLI companion for automatic SQL migrations generation. This is the documentation for Drizzle ORM version for PostgreSQL.

| Driver | Support | | Driver version |
| :- | :-: | :-: | :-: |
| [node-postgres](https://github.com/brianc/node-postgres) | ✅ | | <img alt='driver version' src='https://img.shields.io/npm/dependency-version/drizzle-orm-pg/peer/pg'> |
| [postgres.js](https://github.com/porsager/postgres) | ✅ | [Docs](/drizzle-orm-pg/src/postgres.js/README.md) | <img alt='driver version' src='https://img.shields.io/npm/dependency-version/drizzle-orm-pg/peer/postgres'> |
| [NeonDB Serverless](https://github.com/neondatabase/serverless) | ✅ | | <img alt='driver version' src='https://img.shields.io/npm/dependency-version/drizzle-orm-pg/peer/@neondatabase/serverless'> |

## Installation

```bash
# npm
npm i drizzle-orm drizzle-orm-pg pg
npm i -D @types/pg
npm i -D drizzle-kit

# yarn
yarn add drizzle-orm drizzle-orm-pg pg
yarn add -D @types/pg
yarn add -D drizzle-kit

# pnpm
pnpm add drizzle-orm drizzle-orm-pg pg
pnpm add -D @types/pg
pnpm add -D drizzle-kit
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
import { pgTable, serial, text, varchar } from 'drizzle-orm-pg';
import { drizzle } from 'drizzle-orm-pg/node';
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

const allUsers = await db.select(users);
```

### Connect using node-postgres Client

```typescript
// db.ts
import { pgTable, serial, text, varchar } from 'drizzle-orm-pg';
import { drizzle } from 'drizzle-orm-pg/node';
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

const allUsers = await db.select(users);
```

## Schema declaration

This is how you declare SQL schema in `schema.ts`. You can declare tables, indexes and constraints, foreign keys and enums. Please pay attention to `export` keyword, they are mandatory if you'll be using [drizzle-kit SQL migrations generator](#migrations).

```typescript
import { pgEnum, pgTable, serial, uniqueIndex, varchar } from 'drizzle-orm-pg';

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
import { pgTable, InferModel, serial, text, varchar } from 'drizzle-orm-pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm-pg/node';

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

const result: User[] = await db.select(users);

export async function insertUser(user: NewUser): Promise<User> {
  return db.insert(users).values(user).returning();
}
```

### Declaring indexes and foreign keys

```typescript
import { foreignKey, index, uniqueIndex, integer, pgTable, serial, varchar } from 'drizzle-orm-pg';

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
  countryName: varchar('country_id'),
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

## Column types

The list of all column types. You can also create custom types - [see here](https://github.com/drizzle-team/drizzle-orm/blob/main/docs/custom-types.md).

```typescript
export const popularityEnum = pgEnum('popularity', ['unknown', 'known', 'popular']); // declare enum type
popularityEnum('column_name') // declare enum column

smallint('...')
integer('...')
bigint('...', { mode: 'number' | 'bigint' })

boolean('...')
text('...');
text<'one' | 'two' | 'three'>('...');
varchar('...');
varchar<'one' | 'two' | 'three'>('...');
varchar('...', { length: 256 }); // with length limit

serial('...');
bigserial('...', { mode: 'number' | 'bigint' });

decimal('...', { precision: 100, scale: 2 });
numeric('...', { precision: 100, scale: 2 });

real('...')
doublePrecision('...')

json<...>('...');
json<string[]>('...');
jsonb<...>('...');
jsonb<string[]>('...');

time('...')
time('...', { precision: 6, withTimezone: true })
timestamp('...')
timestamp('...', { mode: 'date' | 'string', precision: 0..6, withTimezone: true })
timestamp('...').defaultNow()
date('...')
date('...', { mode: 'string' | 'date' })
interval('...')
interval('...', { fields: 'day' | 'month' | '...' , precision: 0..6 })

column.primaryKey()
column.notNull()
column.defaultValue(...)
timeColumn.defaultNow()
uuidColumn.defaultRandom()
```

## Table schemas

Drizzle won't append any schema before table definition by default. So if your tables are in `public` schema drizzle generate -> `select * from "users"`

But if you will specify any custom schema you want, then drizzle will generate -> `select * from "custom_schema"."users"`

> **Warning**
> If you will have tables with same names in different schemas then drizzle will respond with `never[]` error in result types and error from database
>
> In this case you may use [alias syntax](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm-pg#join-aliases-and-self-joins)

### Usage example

```typescript
// Table in default schema
const publicUsersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  verified: boolean('verified').notNull().default(false),
  jsonb: jsonb<string[]>('jsonb'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// Table in custom schema
const mySchema = pgSchema('mySchema');

const usersTable = mySchema('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  verified: boolean('verified').notNull().default(false),
  jsonb: jsonb<string[]>('jsonb'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

## Select, Insert, Update, Delete

### Select

Querying, sorting and filtering. We also support partial select.

```typescript
...
import { pgTable, serial, text, varchar } from 'drizzle-orm-pg';
import { drizzle } from 'drizzle-orm-pg/node';
import { and, asc, desc, eq, or } from 'drizzle-orm/expressions';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('full_name'),
});

const db = drizzle(...);

await db.select(users);
await db.select(users).where(eq(users.id, 42));

// you can combine filters with eq(...) or or(...)
await db.select(users)
  .where(and(eq(users.id, 42), eq(users.name, 'Dan')));

await db.select(users)
  .where(or(eq(users.id, 42), eq(users.id, 1)));

// partial select
const result = await db.select(users).fields({
    mapped1: users.id,
    mapped2: users.name,
  });
const { mapped1, mapped2 } = result[0];

// limit, offset & order by
await db.select(users).limit(10).offset(10);
await db.select(users).orderBy(asc(users.name));
await db.select(users).orderBy(desc(users.name));
// you can pass multiple order args
await db.select(users).orderBy(asc(users.name), desc(users.name));

// list of all filter operators
eq(column, value)
eq(column1, column2)
ne(column, value)
ne(column1, column2)

notEq(column, value)
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

and(expressions: SQL[])
or(expressions: SQL[])
```

### Insert

```typescript
import { pgTable, serial, text, timestamp, InferModel } from 'drizzle-orm-pg';
import { drizzle } from 'drizzle-orm-pg/node';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  createdAt: timestamp('created_at'),
});

type NewUser = InferModel<typeof users>;

const db = drizzle(...);

await db.insert(users)
  .values({
    name: 'Andrew',
    createdAt: new Date(),
  });

// accepts vararg of items
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

await db.insert(users).values(...newUsers);

const insertedUsers: NewUser[] = await db.insert(users).values(...newUsers).returning();

const insertedUsersIds: { insertedId: number }[] = await db.insert(users)
    .values(...newUsers)
    .returning({ insertedId: users.id });
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

const updatedUser: InferModel<typeof users> = await db.delete(users)
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

Last but not least. Probably the most powerful feature in the library🚀

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

const result = db.select(cities)
  .leftJoin(users, eq(cities2.id, users2.cityId));
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
const result = await db.select(usersToChatGroups)
  .leftJoin(users, eq(usersToChatGroups.userId, users.id))
  .leftJoin(chatGroups, eq(usersToChatGroups.groupId, chatGroups.id))
  .where(eq(chatGroups.id, 1));
```

#### Join aliases and self-joins

```typescript
import { ..., alias } from 'drizzle-orm-pg';

export const files = pgTable('folders', {
  name: text('name').notNull(),
  parent: text('parent_folder')
})

const nestedFiles = alias(files, 'nested_files');

// will return files and folders and nested files for each folder at root dir
const result = await db.select(files)
  .leftJoin(nestedFiles, eq(files.name, nestedFiles.name))
  .where(eq(files.parent, '/'));
```

#### Join using partial select

```typescript
// Select user ID and city ID and name
const result1 = await db.select(cities).fields({
  userId: users.id,
  cityId: cities.id,
  cityName: cities.name,
}).leftJoin(users, eq(users.cityId, cities.id));

// Select all fields from users and only id and name from cities
const result2 = await db.select(cities).fields({
  // Supports any level of nesting!
  user: users,
  city: {
    id: cities.id,
    name: cities.name,
  },
}).leftJoin(users, eq(users.cityId, cities.id));
```

## Prepared statements

```typescript
const query = db.select(users)
  .where(eq(users.name, 'Dan'))
  .prepare();

const result = await query.execute();
```

### Prepared statements with parameters

```typescript
import { placeholder } from 'drizzle-orm-pg';

const query = db.select(users)
  .where(eq(users.name, placeholder('name')))
  .prepare();

const result = await query.execute({ name: 'Dan' });
```

## Raw queries execution

If you have some complex queries to execute and drizzle-orm can't handle them yet, you can use the `db.execute` method to execute raw queries.

```typescript
// it will automatically run a parametrized query!
const res: QueryResult<{ id: number; name: string }> = await db.execute<
  { id: number; name: string }
>(sql`select * from ${users} where ${users.id} = ${userId}`);
```

## Migrations

### Automatic SQL migrations generation with drizzle-kit

[DrizzleKit](https://www.npmjs.com/package/drizzle-kit) - is a CLI migrator tool for DrizzleORM. It is probably one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.

Check out the [docs for DrizzleKit](https://github.com/drizzle-team/drizzle-kit-mirror)

For schema file:

```typescript
import { index, integer, pgTable, serial, varchar } from 'drizzle-orm-pg';

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
}
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
import { drizzle } from 'drizzle-orm-pg/node';
import { migrate } from 'drizzle-orm-pg/node/migrator';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://user:password@host:port/db',
});
const db = drizzle(pool);

// this will automatically run needed migrations on the database
await migrate(db, { migrationsFolder: './drizzle' });
```
