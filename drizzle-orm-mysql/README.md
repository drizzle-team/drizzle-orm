<div align='center'>
<h1>Drizzle ORM | MySQL <a href=''><img alt='npm' src='https://img.shields.io/npm/v/drizzle-orm-mysql?label='></a></h1>
<img alt='npm' src='https://img.shields.io/npm/dw/drizzle-orm-mysql'>
<img alt='pg version' src='https://img.shields.io/npm/dependency-version/drizzle-orm-mysql/peer/mysql2'>
<img alt='npm bundle size' src='https://img.shields.io/bundlephobia/min/drizzle-orm-mysql'>
<a href='https://discord.gg/yfjTbVXMW4'><img alt='Discord' src='https://img.shields.io/discord/1043890932593987624'></a>
<img alt='NPM' src='https://img.shields.io/npm/l/drizzle-orm-mysql'>
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

Drizzle ORM is a TypeScript ORM for SQL databases designed with maximum type safety in mind. It comes with a [drizzle-kit](https://github.com/drizzle-team/drizzle-kit-mirror) CLI companion for automatic SQL migrations generation. This is the documentation for Drizzle ORM version for PostgreSQL.

## Installation

```bash
# npm
npm i drizzle-orm drizzle-orm-mysql mysql2
npm i -D @types/pg
npm i -D drizzle-kit

# yarn
yarn add drizzle-orm drizzle-orm-mysql mysql2
yarn add -D @types/pg
yarn add -D drizzle-kit

# pnpm
pnpm add drizzle-orm drizzle-orm-mysql2 mysql2
pnpm add -D @types/pg
pnpm add -D drizzle-kit
```

## SQL schema declaration

With `drizzle-orm` you declare SQL schema in TypeScript. You can have either one `schema.ts` file with all declarations or you can group them logically in multiple files. We prefer to use single file schema.

### Single schema file example

```
📦 <project root>
 └ 📂 src
    └ 📂 db
       └ 📜schema.ts
```

### Multiple schema files example

```
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
export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});
```

### Connect using mysql2 Pool (recommended)

```typescript
// db.ts
import { drizzle } from 'drizzle-orm-mysql/mysql2';

import mysql from 'mysql2/promise';
import { users } from './schema';

// create the connection
const poolConnection = mysql.createPool({
    host:'localhost', 
    user: 'root',
    database: 'test'
});

const db = drizzle(poolConnection);

const allUsers = await db.select(users);
```

### Connect using mysql2 Client

```typescript
// db.ts
import { drizzle } from 'drizzle-orm-mysql/mysql2';

import mysql from 'mysql2/promise';
import { users } from './schema';

// create the connection
const connection = await mysql.createConnection({
    host:'localhost', 
    user: 'root', 
    database: 'test'
});

const db = drizzle(connection);

const allUsers = await db.select(users);
```

## Schema declaration

This is how you declare SQL schema in `schema.ts`. You can declare tables, indexes and constraints, foreign keys and enums. Please pay attention to `export` keyword, they are mandatory if you'll be using [drizzle-kit SQL migrations generator](#migrations).

```typescript
// db.ts
import { int, mysqlEnum, mysqlTable, serial, uniqueIndex, varchar } from 'drizzle-orm-mysql';

// declaring enum in database
export const popularityEnum = mysqlEnum('popularity', ['unknown', 'known', 'popular']);

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
	popularity: popularityEnum('popularity'),
});
```

### Database and table entity types

```typescript
// db.ts
import { InferModel, MySqlDatabase, MySqlRawQueryResult, mysqlTable, serial, text, varchar } from 'drizzle-orm-mysql';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm-mysql/mysql2';

const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});

export type User = InferModel<typeof users>; // return type when queried
export type NewUser = InferModel<typeof users, 'insert'>; // insert type
...

// init node-postgres Pool or Client
const poolConnection = mysql.createPool({
    host:'localhost', 
    user: 'root',
    database: 'test'
});

export const db: MySqlDatabase = drizzle(poolConnection);

const result: User[] = await db.select(users);

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

### Declaring indexes and foreign keys

```typescript
// db.ts
import { foreignKey, index, int, mysqlTable, serial, uniqueIndex, varchar } from 'drizzle-orm-mysql';

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
}, (cities) => ({
  // explicit foreign key with 1 column
  countryFk: foreignKey(() => ({
    columns: [cities.countryId],
    foreignColumns: [countries.id],
  })),
  // explicit foreign key with multiple columns
  countryIdNameFk: foreignKey(() => ({
    columns: [cities.countryId, cities.countryName],
    foreignColumns: [countries.id, countries.name],
  })),
}));

// Index declaration reference
index('name_idx')
    .on(table.column1, table.column2, ...)
    .using('btree' | 'hash')
    .lock('default' | 'none' | 'shared' | 'exclusive')
    .algorythm('default' | 'inplace' | 'copy')
```
---here I left---
## Column types


```typescript
export const popularityEnum = mysqlEnum('popularity', ['unknown', 'known', 'popular']);
popularityEnum('column_name');

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
varchar('name', { length: 2 });
text('name');

boolean('name');

date('...');
datetime('...', { mode: 'date' | 'string', fsp: 0..6 });
time('...', { mode: 'date' | 'string', fsp: 0..6 });
year('...');

timestamp('name');
timestamp('...', { mode: 'date' | 'string', fsp: 0..6 })
timestamp('...').defaultNow()

json('name');
json<string[]>('name');
```

## Select, Insert, Update, Delete

### Select

Querying, sorting and filtering. We also support partial select.

```typescript
...
import { mysqlTable, serial, text, varchar } from 'drizzle-orm-mysql';
import { drizzle } from 'drizzle-orm-mysql/mysql2';
import { and, asc, desc, eq, or } from 'drizzle-orm/expressions';

const users = mysqlTable('users', {
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
import { mysqlTable, serial, text, timestamp, InferModel } from 'drizzle-orm-mysql';
import { drizzle } from 'drizzle-orm-mysql/mysql2';

const users = mysqlTable('users', {
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

Last but not least. Probably the most powerful feature in the library🚀

#### Many-to-one

```typescript
const cities = mysqlTable('cities', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  cityId: int('city_id').references(() => cities.id)
});

const result = db.select(cities)
  .leftJoin(users, eq(cities2.id, users2.cityId));
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
import { ..., alias } from 'drizzle-orm-mysql';

export const files = mysqlTable('folders', {
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
  cityName: cities.name
}).leftJoin(users, eq(users.cityId, cities.id));

// Select all fields from users and only id and name from cities
const result2 = await db.select(cities).fields({
  // Supports any level of nesting!
  user: users,
  city: {
    id: cities.id,
    name: cities.name
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
import { placeholder } from 'drizzle-orm-mysql';

const query = db.select(users)
  .where(eq(users.name, placeholder('name')))
  .prepare();

const result = await query.execute({ name: 'Dan' });
```

## Raw queries execution

If you have some complex queries to execute and drizzle-orm can't handle them yet, you can use the `db.execute` method to execute raw queries.

```typescript
// it will automatically run a parametrized query!
const res: MySqlQueryResult<{ id: number; name: string; }> = await db.execute<{ id: number, name: string }>(sql`select * from ${users} where ${users.id} = ${userId}`);
```

## Migrations

### Automatic SQL migrations generation with drizzle-kit

[DrizzleKit](https://www.npmjs.com/package/drizzle-kit) - is a CLI migrator tool for DrizzleORM. It is probably one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.

Check out the [docs for DrizzleKit](https://github.com/drizzle-team/drizzle-kit-mirror)

For schema file:

```typescript
import { index, integer, mysqlTable, serial, varchar } from 'drizzle-orm-mysql';

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
}
```

It will generate:

```SQL

```

And you can run migrations manually or using our embedded migrations module

```typescript
import { drizzle } from 'drizzle-orm-mysql/mysql2';
import { migrate } from 'drizzle-orm-mysql/mysql2/migrator';
import mysql from 'mysql2/promise';

// create the connection
const poolConnection = mysql.createPool({
    host:'localhost', 
    user: 'root',
    database: 'test'
});

const db = drizzle(poolConnection);

// this will automatically run needed migrations on the database
await migrate(db, { migrationsFolder: './drizzle' })
```
