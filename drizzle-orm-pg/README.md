## DrizzleORM [PostgreSQL]
DrizzleORM is a TypeScript ORM library with a [drizzle-kit](#migrations) CLI companion for automatic SQL migrations generation. 
Here you can find extensive docs for PostgreSQL module.

### Installation
```bash
// postgresql
npm install drizzle-orm drizzle-orm-pg
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
import { PgConnector, pgTable, serial, text, varchar } from "drizzle-orm-pg";
import { Pool } from "pg";

const users = pgTable("users", {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
})

const pool = new Pool({ connectionString: "postgres://user:password@host:port/db" });
const connector = new PgConnector(pool);
const db = await connector.connect();

const users = await db.select(users);
```

### Connecting to database
```typescript
import { PgConnector } from "drizzle-orm-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: "postgres://postgres:password@127.0.0.1:5432/postgres" });
const pool = new Pool({
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "password",
  database: "db_name",
});

const connector = new PgConnector(pool);
const db = await connector.connect();
```

This is how you declare SQL schema in `schema.ts`. You can declare tables, indexes and constraints, foreign keys and enums. Please pay attention to `export` keyword, they are mandatory if you'll be using [drizzle-kit SQL migrations generator](#migrations).
```typescript
// declaring enum in database
export const popularityEnum = pgEnum("popularity", ["unknown", "known", "popular"]);

export const countries = pgTable("countries", {
    id: serial("id").primaryKey(),
    name: varchar("name", 256),
  }, (table) => ({
    nameIndex: index("name_idx", table.name, { unique: true });
  })
);

export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: varchar("name", 256),
  countryId: integer("country_id").references(() => countries.id),
  popularity: popularityEnum("popularity"),
})
```

The list of all column types. You can also create custom types - !!see here!!.
```typescript
export const popularityEnum = pgEnum("popularity", ["unknown", "known", "popular"]);
popularityEnum("column_name") // declare enum column

smallint("...")
integer("...")
bigint("...", { mode: "number" | "bigint" })

boolean("...")
text("...");
text<"one" | "two" | "three">("...");
varchar("...");
varchar<"one" | "two" | "three">("...");
varchar("...", { length: 256 }); // with length limit

serial("...");
bigserial("...", { mode: "number" | "bigint" });

decimal("...", { precision: 100, scale: 2 });
numeric("...", { precision: 100, scale: 2 });

real("...")
doublePrecision("...")

json<...>("...");
json<string[]>("...");
jsonb<...>("...");
jsonb<string[]>("...");

time("...")
time("...", { precision: 6, withTimezone: true })
timestamp("...")
timestamp("...", { mode: "date" | "string", precision: 0..6, withTimezone: true })
timestamp("...").defaultNow()
date("...")
date("...", { mode: "string" | "date" })
interval("...")
interval("...", { fields: "day" | "month" | "..." , precision: 0..6 })

column.primaryKey()
column.notNull()
column.defaultValue(...)
```

Declaring indexes and foreign keys
```typescript
import { foreignKey, index, integer, pgTable, serial, varchar } from "drizzle-orm-pg";

export const countries = pgTable("countries", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 256 }),
    population: integer("population"),
  }, (table) => ({
    nameIdx: index("name_idx", table.name), // one column
    namePopulationIdx: index("name_population_idx", [table.name, table.population]), // multiple columns
    uniqueIdx: index("unique_idx", table.name, { unique: true }), // unique index
  })
);

export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 256 }),
  countryId: integer("country_id").references(() => countries.id), // inline foreign key
  countryName: varchar("country_id"),
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

// list of all index params
unique?: boolean;
concurrently?: boolean;
only?: boolean;
using?: sql``; // sql expression
order?: 'asc' | 'desc';
nulls?: 'first' | 'last';
where?: sql``; // sql expression
```

### Create Read Update Delete
Querying, sorting and filtering. We also support partial select.
```typescript
...
import { PgConnector, pgTable, serial, text, varchar } from "drizzle-orm-pg";
import { and, asc, desc, eq, or } from "drizzle-orm/expressions";

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("full_name"),
});

const connector = new PgConnector(...);
const db = await connector.connect();

await db.select(users);
await db.select(users).where(eq(users.id, 42));

// you can combine filters with eq(...) or or(...)
await db.select(users)
  .where(and(eq(users.id, 42), eq(users.name, "Dan")));

await db.select(users)
  .where(or(eq(users.id, 42), eq(users.id, 1)));

// partial select
const result = await db.select(users).fields({
    mapped1: users.id,
    mapped2: users.name,
  });
const { mapped1, mapped2 } = result[0];

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
import { PgConnector, pgTable, serial, text, timestamp } from "drizzle-orm-pg";

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  createdAt: timestamp("created_at"),
});

const connector = new PgConnector(...);
const db = await connector.connect();

await db.insert(users
  .values({
    name: "Andrew",
    createdAt: new Date(),
  });

// accepts vararg of items
await db.insert(users)
  .values(
    {
      name: "Andrew",
      createdAt: new Date(),
    },
    {
      name: "Dan",
      createdAt: new Date(),
    },
  ));

await db.insert(users)
  .values(...[
    {
      name: "Andrew",
      createdAt: new Date(),
    },
    {
      name: "Dan",
      createdAt: new Date(),
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
Many-to-one
```typescript
import { PgConnector, pgTable, serial, text, timestamp } from "drizzle-orm-pg";

const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  cityId: integer("city_id").references(() => cities.id)
});

const connector = new PgConnector(...);
const db = await connector.connect();

const result = db.select(cities).leftJoin(users, eq(cities2.id, users2.cityId))
```

Many-to-many
```typescript
const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

const chatGroups = pgTable("chat_groups", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

const usersToChatGroups = pgTable("usersToChatGroups", {
  userId: integer("user_id").notNull().references(() => users.id),
  groupId: integer("group_id").notNull().references(() => chatGroups.id),
});

...
const connector = new PgConnector(...);
const db = await connector.connect();

// querying user group with id 1 and all the participants(users)
db.select(usersToChatGroups)
  .leftJoin(users, eq(usersToChatGroups.userId, users.id))
  .leftJoin(chatGroups, eq(usersToChatGroups.groupId, chatGroups.id));
```

### Join using partial field select
##### Join Cities with Users getting only needed fields form request
```typescript
await db.select(cities).fields({
  id: cities.id,
  cityName: cities.name
}).leftJoin(users, eq(users.cityId, cities.id));
```

## Migrations
### Automatic SQL migrations generation with drizzle-kit
[DrizzleKit](https://www.npmjs.com/package/drizzle-kit) - is a CLI migrator tool for DrizzleORM. It is probably one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like delitions and renames by prompting user input.\
Check out the [docs for DrizzleKit](https://github.com/drizzle-team/drizzle-kit-mirror)

For schema file:
```typescript
import { AbstractTable } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 256 }),
}, (table)=>({
  nameIdx: index("name_idx", table.fullName),
}));

export const authOtps = pgTable("auth_otp", {
  id: serial("id").primaryKey(),
  phone: varchar("phone", { length: 256 }),
  userId: integer("user_id").foreignKey(() => users.id),
}
```
It will generate:
```SQL
CREATE TABLE IF NOT EXISTS auth_otp (
	"id" SERIAL PRIMARY KEY,
	"phone" character varying(256),
	"user_id" INT
);

CREATE TABLE IF NOT EXISTS users (
	"id" SERIAL PRIMARY KEY,
	"full_name" character varying(256)
);

DO $$ BEGIN
 ALTER TABLE auth_otp ADD CONSTRAINT auth_otp_user_id_fkey FOREIGN KEY ("user_id") REFERENCES users(id);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS users_full_name_index ON users (full_name);
```

## Raw query usage
#### If you have some complex queries to execute and drizzle-orm can't handle them yet, then you could use `rawQuery` execution

##### Execute custom raw query
```typescript
const res: QueryResult<any> = await db.execute(sql`SELECT * FROM users WHERE user.id = ${userId}`)
// it will automatically run a parametrized query!
```
