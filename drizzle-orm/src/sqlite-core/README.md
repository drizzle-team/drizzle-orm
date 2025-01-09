<div align='center'>
<h1>Drizzle ORM | SQLite <a href=''><img alt='npm' src='https://img.shields.io/npm/v/drizzle-orm?label='></a></h1>
<img alt='npm' src='https://img.shields.io/npm/dm/drizzle-orm'>
<img alt='npm bundle size' src='https://img.shields.io/bundlephobia/min/drizzle-orm'>
<a href='https://discord.gg/yfjTbVXMW4'><img alt='Discord' src='https://img.shields.io/discord/1043890932593987624'></a>
<img alt='License' src='https://img.shields.io/npm/l/drizzle-orm'>
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

Drizzle ORM is a [tiny](https://twitter.com/_alexblokh/status/1594735880417472512), [blazingly fast](#️-performance-and-prepared-statements) TypeScript ORM library with a [drizzle-kit](#-migrations) CLI companion for automatic SQL migrations generation.
Here you can find extensive docs for SQLite module.

| Driver                                                                | Support |                                    |
|:----------------------------------------------------------------------|:-------:|:----------------------------------:|
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)          |    ✅    |                                    |
| [sql.js](https://github.com/sql-js/sql.js/)                           |    ✅    |                                    |
| [node-sqlite3](https://github.com/TryGhost/node-sqlite3)              |    ⏳    |                                    |
| [bun:sqlite](https://github.com/oven-sh/bun#bunsqlite-sqlite3-module) |    ✅    |  [Example](/examples/bun-sqlite)   |
| [Cloudflare D1](https://developers.cloudflare.com/d1/)                |    ✅    | [Example](/examples/cloudflare-d1) |
| [Fly.io LiteFS](https://fly.io/docs/litefs/getting-started/)          |    ✅    |                                    |
| [libSQL server](https://github.com/libsql/sqld/)                      |    ✅    |    [Example](/examples/libsql)     |
| [Turso](https://turso.tech/)                                          |    ✅    |    [Example](/examples/libsql)     |
| [Custom proxy driver](/examples/sqlite-proxy)                         |    ✅    |                                    |

## 💾 Installation

```bash
npm install drizzle-orm better-sqlite3
## opt-in automatic migrations generator
npm install -D drizzle-kit 
```

## 🚀 Quick start

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),  // 'id' is the column name
  fullName: text('full_name'),
})

const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

const allUsers = db.select().from(users).all();
```

### Using Drizzle ORM in Next.js App Router

Next.js' App Router have zero-config support for Drizzle ORM.

## Connecting to databases

```typescript
// better-sqlite3 or fly.io LiteFS
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('sqlite.db');
const db/*: BetterSQLite3Database*/ = drizzle(sqlite);
const result = db.select().from(users).all()

// bun js embedded sqlite connector
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';

const sqlite = new Database('nw.sqlite');
const db/*: BunSQLiteDatabase*/ = drizzle(sqlite);
const result = db.select().from(users).all()

// Cloudflare D1 connector
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';

// env.DB from cloudflare worker environment
const db/*: DrizzleD1Database*/ = drizzle(env.DB);
const result = await db.select().from(users).all(); // pay attention this one is async

// libSQL or Turso
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import { Database } from '@libsql/sqlite3';

const sqlite = new Database('libsql://...'); // Remote server
// or
const sqlite = new Database('sqlite.db'); // Local file

const db/*: LibSQLDatabase*/ = drizzle(sqlite);
const result = await db.select().from(users).all(); // pay attention this one is async

// Custom Proxy HTTP driver
  const db = drizzle(async (sql, params, method) => {
    try {
      const rows = await axios.post('http://localhost:3000/query', { sql, params, method });

      return { rows: rows.data };
    } catch (e: any) {
      console.error('Error from sqlite proxy server: ', e.response.data)
      return { rows: [] };
    }
  });
// More example for proxy: https://github.com/drizzle-team/drizzle-orm/tree/main/examples/sqlite-proxy
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

This is how you declare SQL schema in `schema.ts`. You can declare tables, indexes and constraints, foreign keys and enums. 

ℹ Every column has a special _column type_ function that accepts the name of the column in the database (like `integer('id')`)

Please pay attention to `export` keyword, they are mandatory if you'll be using [drizzle-kit SQL migrations generator](#-migrations).

```typescript
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const countries = sqliteTable('countries', {
    id: integer('id').primaryKey(),
    name: text('name'),
  }, (countries) => ({
    nameIdx: uniqueIndex('nameIdx').on(countries.name),
  })
);

export const cities = sqliteTable('cities', {
  id: integer('id').primaryKey(),
  name: text('name'),
  countryId: integer('country_id').references(() => countries.id),
})
```

### Database and table entity types

```typescript
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  fullName: text('full_name'),
  phone: text('phone'),
})

export type User = InferModel<typeof users> // return type when queried
export type InsertUser = InferModel<typeof users, 'insert'> // insert type
...
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('sqlite.db');
const db: BetterSQLite3Database = drizzle(sqlite);

const result: User[] = await db.select().from(users).all();

const insertUser = (user: InsertUser) => {
  return db.insert(users).values(user).run()
}
```

### Customizing the table name

There is a "table creator" available, which allow you to customize the table name, for example, to add a prefix or suffix. This is useful if you need to have tables for different environments or applications in the same database.

```ts
import { sqliteTableCreator } from 'drizzle-orm/sqlite-core';

const sqliteTable = sqliteTableCreator((name) => `myprefix_${name}`);

const users = sqliteTable('users', {
  id: int('id').primaryKey(),
  name: text('name').notNull(),
});
```

## Column types

The list of all column types. You can also create custom types - [see here](/docs/custom-types.md)

```typescript
integer('...');
integer('...', { mode: 'number' | 'timestamp' | 'timestamp_ms' })
real('...');
text('...');
text('role', { enum: ['admin', 'user'] });

blob('...');
blob('...', { mode: 'json' | 'buffer' });
blob('...').$type<{ foo: string }>();

column.primaryKey();
column.notNull();
column.default(...);
```

### Customizing column data type

Every column builder has a `.$type()` method, which allows you to customize the data type of the column. This is useful, for example, with branded types.

```ts
const users = sqliteTable('users', {
  id: integer('id').$type<UserId>().primaryKey(),
  jsonField: blob('json_field').$type<Data>(),
});
```

Declaring indexes, foreign keys and composite primary keys

```typescript
import { sqliteTable, foreignKey, primaryKey, text, integer, index, uniqueIndex, AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const countries = sqliteTable('countries', {
    id: integer('id').primaryKey(),
    name: text('name'),
    population: integer('population'),
    capital: integer('capital').references(() => cities.id, { onUpdate: 'cascade', onDelete: 'cascade' })
  }, (countries) => ({
    nameIdx: index('name_idx').on(countries.name), // one column
    namePopulationIdx: index('name_population_idx').on(countries.name, countries.population), // multiple columns
    uniqueIdx: uniqueIndex('unique_idx').on(countries.name), // unique index
  })
);

export const cities = sqliteTable('cities', {
  id: integer('id').primaryKey(),
  name: text('name'),
  countryId: integer('country_id').references(() => countries.id), // inline foreign key
  countryName: text('country_id'),
  sisterCityId: integer('sister_city_id').references((): AnySQLiteColumn => cities.id), // self-referencing foreign key
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

const pkExample = sqliteTable('pk_example', {
  id: integer('id'),
  name: text('name').notNull(),
  email: text('email').notNull(),
}, (pkExample) => ({
  // composite primary key on multiple columns
  compositePk: primaryKey(pkExample.id, pkExample.name)
}));

// you can have .where() on indexes
index('name_idx').on(table.column).where(sql``)
```

## Select, Insert, Update, Delete

### Select

Querying, sorting and filtering. We also support partial select.

```typescript
...
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { and, asc, desc, eq, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('full_name'),
});

const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

db.select().from(users).all();
db.select().from(users).where(eq(users.id, 42)).get();

// you can combine filters with and(...) or or(...)
db.select().from(users).where(and(eq(users.id, 42), eq(users.name, 'Dan'))).all();

db.select().from(users).where(or(eq(users.id, 42), eq(users.id, 1))).all();

// partial select
const result = db
  .select({
    field1: users.id,
    field2: users.name,
  })
  .from(users)
  .all();
const { field1, field2 } = result[0];

// limit offset & order by
db.select().from(users).limit(10).offset(10).all();
db.select().from(users).orderBy(users.name).all();
db.select().from(users).orderBy(desc(users.name)).all();
// you can pass multiple order args
db.select().from(users).orderBy(asc(users.name), desc(users.name)).all();
```

#### Select from/join raw SQL

```typescript
db.select({ x: sql<number>`x` }).from(sql`generate_series(2, 4) as g(x)`).all();

db
  .select({
    x1: sql<number>`g1.x`,
    x2: sql<number>`g2.x`
  })
  .from(sql`generate_series(2, 4) as g1(x)`)
  .leftJoin(sql`generate_series(2, 4) as g2(x)`)
  .all();
```

#### Conditionally select fields

```typescript
function selectUsers(withName: boolean) {
  return db
    .select({
      id: users.id,
      ...(withName ? { name: users.name } : {}),
    })
    .from(users)
    .all();
}

const users = selectUsers(true);
```

#### WITH clause

```typescript
const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
const result = db.with(sq).select().from(sq).all();
```

> [!NOTE]
> Keep in mind that if you need to select raw `sql` in a WITH subquery and reference that field in other queries, you must add an alias to it:

```typescript
const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users.name})`.as('name') }).from(users));
const result = db.with(sq).select({ name: sq.name }).from(sq).all();
```

Otherwise, the field type will become `DrizzleTypeError` and you won't be able to reference it in other queries. If you ignore the type error and still try to reference the field, you will get a runtime error, because we cannot reference that field without an alias.

#### Select from subquery

```typescript
const sq = db.select().from(users).where(eq(users.id, 42)).as('sq');
const result = db.select().from(sq).all();
```

Subqueries in joins are supported, too:

```typescript
const result = db.select().from(users).leftJoin(sq, eq(users.id, sq.id)).all();
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

and(...expressions: Expr[])
or(...expressions: Expr[])
```

### Insert

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

type NewUser = InferModel<typeof users, "insert">;

const newUser: NewUser = {
  name: 'Andrew',
  createdAt: new Date(),
};

db.insert(users).values(newUser).run();

const insertedUsers/*: NewUser[]*/ = db.insert(users).values(newUser).returning().all();

const insertedUsersIds/*: { insertedId: number }[]*/ = db.insert(users)
  .values(newUser)
  .returning({ insertedId: users.id })
  .all();
```

#### Insert several items

```ts
db.insert(users)
  .values(
    {
      name: 'Andrew',
      createdAt: new Date(),
    },
    {
      name: 'Dan',
      createdAt: new Date(),
    },
  )
  .run();
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

db.insert(users).values(newUsers).run();
```

### Upsert (Insert with on conflict statement)

```typescript
db.insert(users)
  .values({ id: 1, name: 'Dan' })
  .onConflictDoUpdate({ target: users.id, set: { name: 'John' } })
  .run();

db.insert(users)
  .values({ id: 1, name: 'John' })
  .onConflictDoNothing()
  .run();

db.insert(users)
  .values({ id: 1, name: 'John' })
  .onConflictDoNothing({ target: users.id })
  .run();
```

### Update and Delete

```typescript
db.update(users)
  .set({ name: 'Mr. Dan' })
  .where(eq(usersTable.name, 'Dan'))
  .run();
  
db.delete(users)
  .where(eq(usersTable.name, 'Dan'))
  .run();
```

### Aggregations

They work just like they do in SQL, but you have them fully type safe

```typescript
const orders = sqliteTable('order', {
  id: integer('id').primaryKey(),
  orderDate: integer('order_date', { mode: 'timestamp' }).notNull(),
  requiredDate: integer('required_date', { mode: 'timestamp' }).notNull(),
  shippedDate: integer('shipped_date', { mode: 'timestamp' }),
  shipVia: integer('ship_via').notNull(),
  freight: numeric('freight').notNull(),
  shipName: text('ship_name').notNull(),
  shipCity: text('ship_city').notNull(),
  shipRegion: text('ship_region'),
  shipPostalCode: text('ship_postal_code'),
  shipCountry: text('ship_country').notNull(),
  customerId: text('customer_id').notNull(),
  employeeId: integer('employee_id').notNull(),
});

const details = sqliteTable('order_detail', {
  unitPrice: numeric('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  discount: numeric('discount').notNull(),
  orderId: integer('order_id').notNull(),
  productId: integer('product_id').notNull(),
});


db
  .select({
    id: orders.id,
    shippedDate: orders.shippedDate,
    shipName: orders.shipName,
    shipCity: orders.shipCity,
    shipCountry: orders.shipCountry,
    productsCount: sql<number>`count(${details.productId})`,
    quantitySum: sql<number>`sum(${details.quantity})`,
    totalPrice: sql<number>`sum(${details.quantity} * ${details.unitPrice})`,
  })
  .from(orders)
  .leftJoin(details, eq(orders.id, details.orderId))
  .groupBy(orders.id)
  .orderBy(asc(orders.id))
  .all();
```

### Joins

> [!NOTE]
> For in-depth partial select joins documentation, refer to [this page](/docs/joins.md).

### Many-to-one

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const cities = sqliteTable('cities', {
  id: integer('id').primaryKey(),
  name: text('name'),
});

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
  cityId: integer('city_id').references(() => cities.id)
});

const db = drizzle(sqlite);

const result = db.select().from(cities).leftJoin(users, eq(cities.id, users.cityId)).all();
```

### Many-to-many

```typescript
const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
});

const chatGroups = sqliteTable('chat_groups', {
  id: integer('id').primaryKey(),
  name: text('name'),
});

const usersToChatGroups = sqliteTable('usersToChatGroups', {
  userId: integer('user_id').notNull().references(() => users.id),
  groupId: integer('group_id').notNull().references(() => chatGroups.id),
});

...
const db = drizzle(...);

// querying user group with id 1 and all the participants(users)
db
  .select()
  .from(usersToChatGroups)
  .leftJoin(users, eq(usersToChatGroups.userId, users.id))
  .leftJoin(chatGroups, eq(usersToChatGroups.groupId, chatGroups.id))
  .where(eq(chatGroups.id, 1))
  .all();
```

### Join aliases and self-joins

```typescript
import { ..., alias } from 'drizzle-orm/sqlite-core';

export const files = sqliteTable('folders', {
  name: text('name').notNull(),
  parent: text('parent_folder')
})

...
const db = drizzle(...);

const nestedFiles = alias(files, 'nested_files');
db.select().from(files)
  .leftJoin(nestedFiles, eq(files.name, nestedFiles.name))
  .where(eq(files.parent, '/'))
  .all();
// will return files and folders and nested files for each folder at root dir
```

### Join using partial field select

Join Cities with Users getting only needed fields form request

```typescript
db
  .select({
    id: cities.id,
    cityName: cities.name,
    userId: users.id
  })
  .from(cities)
  .leftJoin(users, eq(users.cityId, cities.id))
  .all();
```

## Transactions

```ts
db.transaction((tx) => {
  tx.insert(users).values(newUser).run();
  tx.update(users).set({ name: 'Mr. Dan' }).where(eq(users.name, 'Dan')).run();
  tx.delete(users).where(eq(users.name, 'Dan')).run();
});
```

### Nested transactions

```ts
db.transaction((tx) => {
  tx.insert(users).values(newUser).run();
  tx.transaction((tx2) => {
    tx2.update(users).set({ name: 'Mr. Dan' }).where(eq(users.name, 'Dan')).run();
    tx2.delete(users).where(eq(users.name, 'Dan')).run();
  });
});
```

### Transaction settings

```ts
interface SQLiteTransactionConfig {
  behavior?: 'deferred' | 'immediate' | 'exclusive';
}

db.transaction((tx) => { ... }, {
  behavior: 'immediate',
});
```

## Query builder

Drizzle ORM provides a standalone query builder that allows you to build queries without creating a database instance.

```ts
import { queryBuilder as qb } from 'drizzle-orm/sqlite-core';

const query = qb.select().from(users).where(eq(users.name, 'Dan'));
const { sql, params } = query.toSQL();
```

## Views (WIP)

> [!WARNING]
> views are currently only implemented on the ORM side. That means you can query the views that already exist in the database, but they won't be added to drizzle-kit migrations or `db push` yet.

### Creating a view

```ts
import { sqliteView } from 'drizzle-orm/sqlite-core';

const newYorkers = sqliteView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));
```

> [!WARNING]
> All the parameters inside the query will be inlined, instead of replaced by `$1`, `$2`, etc.

You can also use the [`queryBuilder` instance](#query-builder) directly instead of passing a callback, if you already have it imported.

```ts
import { queryBuilder as qb } from 'drizzle-orm/sqlite-core';

const newYorkers = sqliteView('new_yorkers').as(qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));
```

### Using raw SQL in a view query

In case you need to specify the view query using a syntax that is not supported by the query builder, you can directly use SQL. In that case, you also need to specify the view shape.

```ts
const newYorkers = sqliteView('new_yorkers', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  cityId: integer('city_id').notNull(),
}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);
```

### Describing existing views

There are cases when you are given readonly access to an existing view. In such cases you can just describe the view shape without specifying the query itself or using it in the migrations.

```ts
const newYorkers = sqliteView('new_yorkers', {
  userId: integer('user_id').notNull(),
  cityId: integer('city_id'),
}).existing();
```

## ⚡️ Performance and prepared statements

With Drizzle ORM you can go [**faster than better-sqlite3 driver**](https://twitter.com/_alexblokh/status/1593593415907909634) by utilizing our `prepared statements` and `placeholder` APIs

```typescript
import { placeholder } from 'drizzle-orm';

const db = drizzle(...);

const q = db.select().from(customers).prepare();
q.all() // SELECT * FROM customers

const q = db.select().from(customers).where(eq(customers.id, placeholder('id'))).prepare()

q.get({ id: 10 }) // SELECT * FROM customers WHERE id = 10
q.get({ id: 12 }) // SELECT * FROM customers WHERE id = 12

const q = db
  .select()
  .from(customers)
  .where(sql`lower(${customers.name}) like ${placeholder('name')}`)
  .prepare();

q.all({ name: '%an%' }) // SELECT * FROM customers WHERE name ilike '%an%'
```

## 🗄 Migrations

### Automatic SQL migrations generation with drizzle-kit

[Drizzle Kit](https://www.npmjs.com/package/drizzle-kit) is a CLI migrator tool for Drizzle ORM. It is probably the one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.
Check out the [docs for Drizzle Kit](https://github.com/drizzle-team/drizzle-kit-mirror).

For schema file:

```typescript
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  fullName: text('full_name'),
}, (users) => ({
  nameIdx: index('name_idx', users.fullName),
}));

export const authOtps = sqliteTable('auth_otp', {
  id: integer('id').primaryKey(),
  phone: text('phone'),
  userId: integer('user_id').references(() => users.id),
});
```

It will generate:

```SQL
CREATE TABLE IF NOT EXISTS auth_otp (
  'id' INTEGER PRIMARY KEY,
  'phone' TEXT,
  'user_id' INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  'id' INTEGER PRIMARY KEY,
  'full_name' TEXT
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
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';

const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

// this will automatically run needed migrations on the database
migrate(db, { migrationsFolder: './drizzle' });
```

## Utility stuff

### Printing SQL query

```typescript
const query = db
  .select({ id: users.id, name: users.name })
  .from(users)
  .groupBy(users.id)
  .toSQL();
// query:
{
  sql: 'select 'id', 'name' from 'users' group by 'users'.'id'',
  params: [],
}
```

### Raw query usage

```typescript
// it will automatically run a parametrized query!
const res: QueryResult<any> = db.run(sql`SELECT * FROM users WHERE user.id = ${userId}`);
```

## Logging

To enable default query logging, just pass `{ logger: true }` to the `drizzle` function:

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';

const db = drizzle(sqlite, { logger: true });
```

You can change the logs destination by creating a `DefaultLogger` instance and providing a custom `writer` to it:

```typescript
import { DefaultLogger, LogWriter } from 'drizzle-orm/logger';
import { drizzle } from 'drizzle-orm/better-sqlite3';

class MyLogWriter implements LogWriter {
  write(message: string) {
    // Write to file, console, etc.
  }
}

const logger = new DefaultLogger({ writer: new MyLogWriter() });

const db = drizzle(sqlite, { logger });
```

You can also create a custom logger:

```typescript
import { Logger } from 'drizzle-orm/logger';
import { drizzle } from 'drizzle-orm/better-sqlite3';

class MyLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    console.log({ query, params });
  }
}

const db = drizzle(sqlite, { logger: new MyLogger() });
```

## Table introspect API

See [dedicated docs](/docs/table-introspect-api.md).
