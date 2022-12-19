# Drizzle ORM | SQLite
DrizzleORM is a [tiny](https://twitter.com/_alexblokh/status/1594735880417472512), [blazingly fast](#performance-and-prepared-statements) TypeScript ORM library with a [drizzle-kit](#migrations) CLI companion for automatic SQL migrations generation. 
Here you can find extensive docs for SQLite module. We support `better-sqlite3`, `node-sqlite`, `bun:sqlite`, `Cloudflare D1`, `Fly.io LiteFS` drivers.

## 💾 Installation
```bash
npm install drizzle-orm drizzle-orm-sqlite better-sqlite3
## opt-in automatic migrations generator
npm install -D drizzle-kit 
```

## 🚀 Quick start
```typescript
import { sqliteTable, text, integer } from "drizzle-orm-sqlite";
import { drizzle } from 'drizzle-orm-sqlite/better-sqlite3';
import Database from "better-sqlite3";

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  fullName: text('full_name'),
})

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

const users = db.select(users).all();
```

## Connecting to databases
```typescript
// better-sqlite3 or fly.io LiteFS
import { drizzle, BetterSQLite3Database } from 'drizzle-orm-sqlite/better-sqlite3';
import Database from "better-sqlite3";

const sqlite = new Database("sqlite.db");
const db: BetterSQLite3Database = drizzle(sqlite);
const result = db.select(users).all()

// bun js embedded sqlite connector
import { drizzle, BunSQLiteDatabase } from "drizzle-orm-sqlite/bun";
import { Database } from "bun:sqlite";

const sqlite = new Database("nw.sqlite");
const db: BunSQLiteDatabase = drizzle(sqlite);
const result = db.select(users).all()

// Cloudflare D1 connector
import { drizzle, DrizzleD1Database } from 'drizzle-orm-sqlite/d1';

// env.DB from cloudflare worker environment
const db: DrizzleD1Database = drizzle(env.DB);
const result = await db.select(users).all() // pay attention this one is async
```

## SQL schema declaration
With `drizzle-orm` you declare SQL schema in TypeScript. You can have either one `schema.ts` file with all declarations or you can group them logically in multiple files. We prefer to use single file schema.
```
📦project
 ├ 📂src
 │ ├ 📂data
 │ │ └ 📜schema.ts
 │ └ ...
 ├ ...
 └ 📜package.json
 
## or multiple schema files
├ 📂data
  ├ 📜users.ts
  ├ 📜countries.ts
  ├ 📜cities.ts
  ├ 📜products.ts
  ├ 📜clients.ts
  ├ 📜enums.ts
  └ 📜etc.ts
```

This is how you declare SQL schema in `schema.ts`. You can declare tables, indexes and constraints, foreign keys and enums. Please pay attention to `export` keyword, they are mandatory if you'll be using [drizzle-kit SQL migrations generator](#migrations).
```typescript
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm-sqlite";

export const countries = sqliteTable("countries", {
    id: integer("id").primaryKey(),
    name: text("name"),
  }, (table) => ({
    nameIdx: uniqueIndex("nameIdx").on(table.name),
  })
);

export const cities = sqliteTable("cities", {
  id: integer("id").primaryKey(),
  name: text("name"),
  countryId: integer("country_id").references(() => countries.id),
})
```

Database and table entity types
```typescript
import { InferModel, text, integer, sqliteTable } from "drizzle-orm-sqlite";

const users = sqliteTable("users", {
  id: integer('id').primaryKey(),
  fullName: text('full_name'),
  phone: text('phone'),
})

export type User = InferModel<typeof users> // return type when queried
export type InsertUser = InferModel<typeof users, "insert"> // insert type
...
import { drizzle, BetterSQLite3Database } from 'drizzle-orm-sqlite/better-sqlite3';
import Database from "better-sqlite3";

const sqlite = new Database("sqlite.db");
const db: BetterSQLite3Database = drizzle(sqlite);

const result: User[] = await db.select(users).all()

const insertUser = (user: InsertUser) => {
  return db.insert(users).values(user).run()
}
```


The list of all column types. You can also create custom types - !!see here!!.
```typescript
integer("...")
integer("...", { mode: "number" | "timestamp" | "bigint" })
real("...")
text("...");
text<"union" | "string" | "type">("...");

blob("...");
blob("...", { mode: "json" | "buffer" });
blob<{ foo: string }>("...");

column.primaryKey()
column.notNull()
column.default(...)
```

Declaring indexes and foreign keys
```typescript
import { sqliteTable, foreignKey, text, integer, index, uniqueIndex } from "drizzle-orm-sqlite";

export const countries = sqliteTable("countries", {
    id: integer("id").primaryKey(),
    name: text("name", { length: 256 }),
    population: integer("population"),
  }, (table) => ({
    nameIdx: index("name_idx").on(table.name), // one column
    namePopulationIdx: index("name_population_idx").on(table.name, table.population), // multiple columns
    uniqueIdx: uniqueIndex("unique_idx").on(table.name), // unique index
  })
);

export const cities = sqliteTable("cities", {
  id: integer("id").primaryKey(),
  name: text("name", { length: 256 }),
  countryId: integer("country_id").references(() => countries.id), // inline foreign key
  countryName: text("country_id"),
}, (table) => ({
  // explicit foreign key with 1 column
  countryFk: foreignKey(() => ({
    columns: [table.countryId],
    foreignColumns: [countries.id],
  })),
  // explicit foreign key with multiple columns
  countryIdNameFk: foreignKey(() => ({
    columns: [table.countryId, table.countryName],
    foreignColumns: [countries.id, countries.name],
  })),
}));

// you can have .where() on indexes
index("name_idx").on(table.name).where(sql``)
```

### Create Read Update Delete
Querying, sorting and filtering. We also support partial select.
```typescript
...
import { sqliteTable, text, integer } from "drizzle-orm-sqlite";
import { and, asc, desc, eq, or } from "drizzle-orm/expressions"
import { drizzle } from 'drizzle-orm-sqlite/better-sqlite3';
import Database from "better-sqlite3";

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("full_name"),
});

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

db.select(users).all();
db.select(users).where(eq(users.id, 42)).get();

// you can combine filters with and(...) or or(...)
db.select(users).where(and(eq(users.id, 42), eq(users.name, "Dan"))).all();

db.select(users).where(or(eq(users.id, 42), eq(users.id, 1))).all();

// partial select
const result = db.select(users).fields({
    field1: users.id,
    field2: users.name,
  }).all();
const { field1, field2 } = result[0];

// limit offset & order by
db.select(users).limit(10).offset(10).all();
db.select(users).orderBy(asc(users.name)).all();
db.select(users).orderBy(desc(users.name)).all();
// you can pass multiple order args
db.select(users).orderBy(asc(users.name), desc(users.name)).all();

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

and(exressions: Expr[])
or(exressions: Expr[])
```

Inserting
```typescript
import { sqliteTable, text, integer } from "drizzle-orm-sqlite";
import { drizzle } from 'drizzle-orm-sqlite/better-sqlite3';
import Database from "better-sqlite3";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

db.insert(users).values({ name: "Andrew", createdAt: +new Date() }).run();

// insert multiple users
db.insert(users).values({
      name: "Andrew",
      createdAt: +new Date(),
    },{
      name: "Dan",
      createdAt: +new Date(),
    }).run();

// insert with returning
const insertedUser = db.insert(users).values({ name: "Dan", createdAt: +new Date() }).returning().get()
```

Update and Delete
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
const orders = sqliteTable("order", {
  id: integer("id").primaryKey(),
  orderDate: integer("order_date", { mode: "timestamp" }).notNull(),
  requiredDate: integer("required_date", { mode: "timestamp" }).notNull(),
  shippedDate: integer("shipped_date", { mode: "timestamp" }),
  shipVia: integer("ship_via").notNull(),
  freight: numeric("freight").notNull(),
  shipName: text("ship_name").notNull(),
  shipCity: text("ship_city").notNull(),
  shipRegion: text("ship_region"),
  shipPostalCode: text("ship_postal_code"),
  shipCountry: text("ship_country").notNull(),
  customerId: text("customer_id").notNull(),
  employeeId: integer("employee_id").notNull(),
});

const details = sqliteTable("order_detail", {
  unitPrice: numeric("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  discount: numeric("discount").notNull(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
});


db.select(orders).fields({
    id: orders.id,
    shippedDate: orders.shippedDate,
    shipName: orders.shipName,
    shipCity: orders.shipCity,
    shipCountry: orders.shipCountry,
    productsCount: sql`count(${details.productId})`.as<number>(),
    quantitySum: sql`sum(${details.quantity})`.as<number>(),
    totalPrice: sql`sum(${details.quantity} * ${details.unitPrice})`.as<number>(),
  })
  .leftJoin(details, eq(orders.id, details.orderId))
  .groupBy(orders.id)
  .orderBy(asc(orders.id))
  .all();
```


### Joins
Last but not least. Probably the most powerful feature in the library🚀
### Many-to-one
```typescript
import { sqliteTable, text, integer } from "drizzle-orm-sqlite";
import { drizzle } from 'drizzle-orm-sqlite/better-sqlite3';

const cities = sqliteTable("cities", {
  id: integer("id").primaryKey(),
  name: text("name"),
});

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name"),
  cityId: integer("city_id").references(() => cities.id)
});

const db = drizzle(sqlite);

const result = db.select(cities).leftJoin(users, eq(cities2.id, users2.cityId)).all()
```

### Many-to-many
```typescript
const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name"),
});

const chatGroups = sqliteTable("chat_groups", {
  id: integer("id").primaryKey(),
  name: text("name"),
});

const usersToChatGroups = sqliteTable("usersToChatGroups", {
  userId: integer("user_id").notNull().references(() => users.id),
  groupId: integer("group_id").notNull().references(() => chatGroups.id),
});

...
const db = drizzle(...);

// querying user group with id 1 and all the participants(users)
db.select(usersToChatGroups)
  .leftJoin(users, eq(usersToChatGroups.userId, users.id))
  .leftJoin(chatGroups, eq(usersToChatGroups.groupId, chatGroups.id))
  .where(eq(chatGroups.id, 1))
  .all();
```

### Join aliases and selfjoins
```typescript
import { ..., alias } from "drizzle-orm-sqlite";

export const files = sqliteTable("folders", {
  name: text("name").notNull(),
  parent: text("parent_folder")
})

...
const db = drizzle(...);

const nestedFiles = alias(files, "nested_files");
db.select(files)
  .leftJoin(nestedFiles, eq(files.name, nestedFiles.name))
  .where(eq(files.parent, "/"))
  .all();
// will return files and folers and nested files for each folder at root dir
```

### Join using partial field select
Join Cities with Users getting only needed fields form request
```typescript
db.select(cities).fields({
  id: cities.id,
  cityName: cities.name
  userId: users.id
}).leftJoin(users, eq(users.cityId, cities.id))
  .all();
```

## ⚡️ Performance and prepared statements
With Drizzle ORM you can go [**faster than better-sqlite3 driver**](https://twitter.com/_alexblokh/status/1593593415907909634) by utilizing our `prepared statements` and `placeholder` APIs
```typescript
import { placeholder } from "drizzle-orm/sql";

const db = drizzle(...);

const q = db.select(customers).prepare();
q.all() // SELECT * FROM customers

const q = db.select(customers).where(eq(customers.id, placeholder("id"))).prepare()

q.get({ id: 10 }) // SELECT * FROM customers WHERE id = 10
q.get({ id: 12 }) // SELECT * FROM customers WHERE id = 12

const q = db.select(customers)
  .where(sql`lower(${customers.name}) like ${placeholder("name")}`)
  .prepare();

q.all({ name: "%an%" }) // SELECT * FROM customers WHERE name ilike '%an%'
```

## 🗄 Migrations
### Automatic SQL migrations generation with drizzle-kit
[DrizzleKit](https://www.npmjs.com/package/drizzle-kit) - is a CLI migrator tool for DrizzleORM. It is probably one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like delitions and renames by prompting user input.\
Check out the [docs for DrizzleKit](https://github.com/drizzle-team/drizzle-kit-mirror)

For schema file:
```typescript
import { index, integer, sqliteTable, text } from "drizzle-orm-sqlite";

export const users = sqliteTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name"),
}, (table)=>({
  nameIdx: index("name_idx", table.fullName),
}));

export const authOtps = sqliteTable("auth_otp", {
  id: integer("id").primaryKey(),
  phone: text("phone"),
  userId: integer("user_id").references(() => users.id),
}
```
It will generate:
```SQL
CREATE TABLE IF NOT EXISTS auth_otp (
	"id" INTEGER PRIMARY KEY,
	"phone" TEXT,
	"user_id" INTEGER
);

CREATE TABLE IF NOT EXISTS users (
	"id" INTEGER PRIMARY KEY,
	"full_name" TEXT
);

DO $$ BEGIN
 ALTER TABLE auth_otp ADD CONSTRAINT auth_otp_user_id_fkey FOREIGN KEY ("user_id") REFERENCES users(id);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS users_full_name_index ON users (full_name);
```

And you can run migrations manually or using our embedded migrations module
```typescript
import { drizzle } from 'drizzle-orm-sqlite/better-sqlite3';
import { migrate } from 'drizzle-orm-sqlite/better-sqlite3/migrator';
import Database from "better-sqlite3";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

// this will automatically run needed migrations on the database
migrate(db, { migrationsFolder: "./drizzle" })
```

## Utility stuff
### Printing SQL query
```typescript
const query = db.select(users)
		.fields({ id: users.id, name: users.name })
		.groupBy(users.id)
		.toSQL();
// query:
{
  sql: 'select "id", "name" from "users" group by "users"."id"',
  params: [],
}
``` 

### Raw query usage
```typescript
// it will automatically run a parametrized query!
const res: QueryResult<any> = await db.run(sql`SELECT * FROM users WHERE user.id = ${userId}`)
```
