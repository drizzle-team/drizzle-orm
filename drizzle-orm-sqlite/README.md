## DrizzleORM [SQLite]
DrizzleORM is a TypeScript ORM library with a [drizzle-kit](#migrations) CLI companion for automatic SQL migrations generation. 
Here you can find extensive docs for SQLite module. We support `better-sqlite3`, `node-sqlite`, `bun:sqlite`, `Cloudflare D1`, `Fly.io LiteFS` drivers.

### Installation
```bash
npm install drizzle-orm drizzle-orm-sqlite

## opt-in automatic migrations generator
npm install -D drizzle-kit 
```

### SQL schema declaration
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

### Quick start
```typescript
import { SQLiteConnector, sqliteTable, text, integer } from "drizzle-orm-sqlite";
import Database from "better-sqlite3";

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  fullName: text('full_name'),
})

const sqlite = new Database("sqlite.db");
const connector = new SQLiteConnector(sqlite);
const db = connector.connect();

const users = db.select(users);
```

### Connecting to database
```typescript
import { SQLiteConnector } from "drizzle-orm-sqlite";
import Database from "better-sqlite3";

const sqlite = new Database("sqlite.db");
const connector = new SQLiteConnector(sqlite);
const db = connector.connect();
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
import { SQLiteConnector, InferModel, text, integer, sqliteTable } from "drizzle-orm-sqlite";

const users = sqliteTable("users", {
  id: integer('id').primaryKey(),
  fullName: text('full_name'),
  phone: text('phone'),
})

export type User = InferModel<typeof users> // return type when queried
export type InsertUser = InferModel<typeof users, "insert"> // insert type
...

import { SQLiteConnector } from "drizzle-orm-sqlite";
import Database from "better-sqlite3";

const sqlite = new Database("sqlite.db");
const connector = new SQLiteConnector(sqlite);
const db: SQLiteDatabase = connector.connect();

const result: User[] = await db.select(users)

const insertUser = (user: InsertUser) => {
  return db.insert(users).values(user)
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
import { SQLiteConnector } from "drizzle-orm-sqlite";
import Database from "better-sqlite3";

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("full_name"),
});

const sqlite = new Database("sqlite.db");
const connector = new SQLiteConnector(sqlite);
const db = connector.connect();

await db.select(users);
await db.select(users).where(eq(users.id, 42));

// you can combine filters with and(...) or or(...)
await db.select(users)
  .where(and(eq(users.id, 42), eq(users.name, "Dan")));

await db.select(users)
  .where(or(eq(users.id, 42), eq(users.id, 1)));

// partial select
const result = await db.select(users).fields({
    field1: users.id,
    field2: users.name,
  });
const { field1, field2 } = result[0];

// limit offset & order by
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

and(exressions: Expr[])
or(exressions: Expr[])
```

Inserting
```typescript
import { sqliteTable, text, integer } from "drizzle-orm-sqlite";
import { SQLiteConnector } from "drizzle-orm-sqlite";
import Database from "better-sqlite3";

const sqlite = new Database("sqlite.db");
const connector = new SQLiteConnector(sqlite);
const db = connector.connect();

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

await db.insert(users
  .values({
    name: "Andrew",
    createdAt: +new Date(),
  });

// accepts vararg of items
await db.insert(users)
  .values(
    {
      name: "Andrew",
      createdAt: +new Date(),
    },
    {
      name: "Dan",
      createdAt: +new Date(),
    },
  ));

await db.insert(users)
  .values(...[
    {
      name: "Andrew",
      createdAt: +new Date(),
    },
    {
      name: "Dan",
      createdAt: +new Date(),
    },
  ]);
```

Update and Delete
```typescript
await db.update(users)
  .set({ name: 'Mr. Dan' })
  .where(eq(usersTable.name, 'Dan'));
	
await db.delete(users)
  .where(eq(usersTable.name, 'Dan'));
```

### Joins
Last but not least. Probably the most powerful feature in the library🚀
### Many-to-one
```typescript
import { sqliteTable, text, integer } from "drizzle-orm-sqlite";
import { SQLiteConnector } from "drizzle-orm-sqlite";

const cities = sqliteTable("cities", {
  id: integer("id").primaryKey(),
  name: text("name"),
});

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name"),
  cityId: integer("city_id").references(() => cities.id)
});

const db = new SQLiteConnector(sqlite).connect();

const result = db.select(cities).leftJoin(users, eq(cities2.id, users2.cityId))
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
const db = new SQLiteConnector(...).connect();

// querying user group with id 1 and all the participants(users)
db.select(usersToChatGroups)
  .leftJoin(users, eq(usersToChatGroups.userId, users.id))
  .leftJoin(chatGroups, eq(usersToChatGroups.groupId, chatGroups.id))
  .where(eq(chatGroups.id, 1));
```

### Join aliases and selfjoins
```typescript
import { ..., alias } from "drizzle-orm-sqlite";

export const files = sqliteTable("folders", {
  name: text("name").notNull(),
  parent: text("parent_folder")
})

...
const db = new SQLiteConnector(...).connect();

const nestedFiles = alias(files, "nested_files");
db.select(files)
  .leftJoin(nestedFiles, eq(files.name, nestedFiles.name))
  .where(eq(files.parent, "/"));
// will return files and folers and nested files for each folder at root dir
```

### Join using partial field select
Join Cities with Users getting only needed fields form request
```typescript
db.select(cities).fields({
  id: cities.id,
  cityName: cities.name
  userId: users.id
}).leftJoin(users, eq(users.cityId, cities.id));
```

## Migrations
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
import { SQLiteConnector } from "drizzle-orm-sqlite";
import Database from "better-sqlite3";

const sqlite = new Database("sqlite.db");
const connector = new SQLiteConnector(sqlite);
const db = connector.connect();

// this will automatically run needed migrations on the database
connector.migrate({ migrationsFolder: "./drizzle" })
```

## Raw query usage
#### If you have some complex queries to execute and drizzle-orm can't handle them yet, then you could use `rawQuery` execution

##### Execute custom raw query
```typescript
// it will automatically run a parametrized query!
const res: QueryResult<any> = await db.run(sql`SELECT * FROM users WHERE user.id = ${userId}`)

// you can use
db.run()
db.get()
db.all()
db.values()
```
