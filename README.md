## DrizzleORM
DrizzleORM is a TypeScript ORM library with a [drizzle-kit](https://github.com/lambda-direct/drizzle-orm/tree/develop/kit) CLI companion for automatic SQL migrations generation. It's meant to be a library, not a framework, stay as an opt-in solution all the time at any levels. We try to follow SQL-like syntax whenever possible, be strongly typed ground top and fail in compile time, not in runtime. We implemented best in class `joins` and second to none `migrations generation`. Library has almost zero dependencies and being battle tested on production projects by multiple teams 🚀

| database    | support |
|:--          |  :---:  |
| PostgreSQL  | ✅      |
| MySQL       | ⏳      |
| DynamoDB    | ⏳      |
| SQLite      | ⏳      |
| MS SQL      | ⏳      |
| CockroachDB | ⏳      |

### Installation
```bash
npm install drizzle-orm drizzle-kit
```

### Quick start
```typescript
import { drizzle, PgTable } from 'drizzle-orm'

export class UsersTable extends PgTable<UsersTable> {
  public id = this.serial('id').primaryKey();
  public fullName = this.text('full_name');
  public phone = this.varchar('phone', { size: 256 });

  public tableName(): string {
    return 'users';
  }
}
export type User = InferType<UsersTable>

const db = await drizzle.connect("postgres://user:password@host:port/db");
const usersTable = new UsersTable(db);

const users: User[] = await usersTable.select().execute();
```

### Connecting to database
```typescript

const db = await drizzle.connect("postgres://user:password@host:port/db");
const db = await drizzle.connect({
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "postgres",
  db: "db_name",
});
```

### SQL schema declaration
With `drizzle-orm` you declare SQL schema in typescritp. You can have either one `schema.ts` file with all declarations or you can group them logically in multiple files. We prefer to use single file schema.
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
// declaring enum in database
export const popularityEnum = createEnum({ alias: 'popularity', values: ['unknown', 'known', 'popular'] });

export class CountriesTable extends PgTable<CountriesTable> {
  id = this.serial("id").primaryKey();
  name = this.varchar("name", { size: 256 })
	
  // declaring index
  nameIndex = this.uniqueIndex(this.name)

  public tableName(): string {
    return 'countries';
  }
}

export class CitiesTable extends PgTable<CitiesTable> {
  id = this.serial("id").primaryKey();
  name = this.varchar("name", { size: 256 })
  countryId = this.int("country_id").foreignKey(CountriesTable, (country) => country.id)

  // declaring enum column in table
  popularity = this.type(popularityEnum, "popularity")

  public tableName(): string {
    return 'cities';
  }
}
```

The list of all possible types. You can also create custom types - !!see here!!.
```typescript
export const enum = createEnum({ alias: "database-name", values: ["value1", "value2", "value3"] });
type(enum, "...")

smallint("...")
int("...")
bigint("...", maxBytes: "max_bytes_53")
bigint("...", maxBytes: "max_bytes_64")

bool("...")
text("...");
varchar("...");
varchar("...", { size: 256 });

serial("...");
bigserial("...", maxBytes: "max_bytes_53");
bigserial("...", maxBytes: "max_bytes_64");

decimal("...", { precision: 100, scale: 2 });

jsonb<...>("...");
jsonb<string[]>("...");

time("...")
timestamp("...")    // with timezone
timestamptz("..."); // without timezone
timestamp("...").defaultValue(Defaults.CURRENT_TIMESTAMP)

index(column);
index([column1, column2, ...]);
uniqueIndex(column);
uniqueIndex([column1, column2, ...]);


column.primaryKey()
column.notNull()
column.defaultValue(...)

// 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
column.foreignKey(Table, (table) => table.column, { onDelete: "CASCADE", onUpdate: "CASCADE" });
```

### Create Read Update Delete
Querying, sorting and filtering. We also support partial select.
```typescript
const db = await drizzle.connect("...")
const table = new UsersTable(db);

const result: User[] = await table.select().execute();
await table.select().where(
  eq(table.id, 42)
).execute();

// you can combine filters with eq(...) or or(...)
await table.select().where(
  and([eq(table.id, 42), eq(table.name, "Dan")])
).execute();

await table.select().where(
  or([eq(table.id, 42), eq(table.id, 1)])
).execute();

// partial select
const result = await table.select({
     mapped1: table.id,
     mapped2: table.name,
}).execute();
const { mapped1, mapped2 } = result[0];

// limit offset & order by
await table.select().limit(10).offset(10).execute()
await table.select().orderBy((table) => table.name, Order.ASC)
await table.select().orderBy((table) => table.name, Order.DESC)

// list of all filter operators
eq(table.column, value)
notEq(table.column, value)
less(table.column, value)
lessEq(table.column, value)
greater(table.column, value)
greaterEq(table.column, value)
isNull(table.column)
isNotNull(table.column)

inArray(table.column, [...values])
like(table.column, value)
raw("raw sql filter")

and(exressions: Expr[])
or(exressions: Expr[])
```
Inserting
##### Insert `user` with required fields
```typescript
await usersTable.insert({
  test: 1,
  createdAt: new Date(),
}).execute();
```
##### Insert `user` with required fields and get all rows as array
```typescript
const result = await usersTable.insert({
  name: "Andrew",
  createdAt: new Date(),
}).execute();

const result = await usersTable.insertMany([{
  name: "Andrew",
  createdAt: new Date(),
}, {
  name: "Dan",
  createdAt: new Date(),
}]).execute();

//await usersTable.insert({
//  name: "Dan"
//})
//.onConflict(
//	(table) => table.name,
//	{ name: 'name value to be upserted' }
//).execute();
```

Update and Delete
```typescript
await usersTable.update()
  .where(eq(usersTable.name, 'Dan'))
  .set({ name: 'Mr. Dan' })
  .execute();
	
await usersTable.delete()
  .where(eq(usersTable.name, 'Dan'))
  .execute();
```

### Joins
Last but not least. Probably the most powerful feature in the library🚀
Many-to-one
```typescript
const usersTable = new UsersTable(db);
const citiesTable = new CitiesTable(db);

const result = await citiesTable.select()
  .leftJoin(usersTable, (cities, users) => eq(cities.userId, users.id))
  .where((cities, users) => eq(cities.id, 1))
  .execute();

const citiesWithUsers: { city: City, user: User }[] = result.map((city, user) => ({ city, user }));
```
Many-to-many
```typescript
export class UsersTable extends PgTable<UsersTable> {
  id = this.serial("id").primaryKey();
	name = this.varchar("name");
}

export class ChatGroupsTable extends PgTable<ChatGroupsTable> {
  id = this.serial("id").primaryKey();
}

export class ManyToManyTable extends PgTable<ManyToManyTable> {
  userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, { onDelete: 'CASCADE' });
  groupId = this.int('group_id').foreignKey(ChatGroupsTable, (table) => table.id, { onDelete: 'CASCADE' });
}

...
const usersTable = new UsersTable(db);
const chatGroupsTable = new ChatGroupsTable(db);
const manyToManyTable = new ManyToManyTable(db);

// querying user group with id 1 and all the participants(users)
const usersWithUserGroups = await manyToManyTable.select()
  .leftJoin(usersTable, (manyToMany, users) => eq(manyToManyTable.userId, users.id))
  .leftJoin(chatGroupsTable, (manyToMany, _users, chatGroups) => eq(manyToManyTable.groupId, chatGroups.id))
  .where((manyToMany, _users, userGroups) => eq(userGroups.id, 1))
  .execute();
```

### Join using partial field select
##### Join Cities with Users getting only needed fields form request
```typescript
    await citiesTable.select({
      id: citiesTable.id,
      userId: citiesTable.userId,
    })
      .leftJoin(usersTable, (cities, users) => eq(cities.userId, users.id))
      .where((cities, users) => eq(cities.id, 1))
      .execute();

const citiesWithUserObject = userWithCities.map((city, user) => ({ ...city, user }));
```
### Another join examples with different callback ON statements
```typescript
await citiesTable.select()
  .leftJoin(usersTable, (cities, _users) => eq(cities.id, 13))
  .where((cities, _users) => eq(cities.location, 'q'))
  .execute();
// Join statement generated from query
// LEFT JOIN users AS users_1
// ON cities."id"=$1
// WHERE cities."page"=$2
//
// Values: [13, 'q']

await citiesTable.select()
  .leftJoin(usersTable, (cities, _users) => and([
    eq(cities.id, 13), notEq(cities.id, 14),
  ]))
  .execute();
// Join statement generated from query
// LEFT JOIN users AS users_1
// ON (cities."id"=$1 and cities."id"!=$2)
//
// Values: [13, 14]

await citiesTable.select()
  .leftJoin(usersTable, (_cities, _users) => raw('<custom expression after ON statement>'))
  .where((cities, _users) => eq(cities.location, 'location'))
  .execute();
// Join statement generated from query
// LEFT JOIN users AS users_1
// ON <custom expression after ON statement>
// WHERE cities."page"=$1
// 
// Values: ['location']
```


## Migrations
### Automatic SQL migrations generation with drizzle-kit
DrizzleKit - is a CLI migrator tool for DrizzleORM. It is probably one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like delitions and renames by prompting user input.

### How it works
`drizzle-kit` will traverse `data folder` from configuration file, find all schema .ts files. Generate schema snapshot and compare it to the previous version(if there's one). Based on the difference it will generate all needed SQL migrations and if there're any `automatically unresolvable` cases like `renames` it will prompt user for input.

For schema file:
```typescript
import { AbstractTable } from "drizzle-orm";

export class UsersTable extends AbstractTable<UsersTable> {
  public id = this.serial("id").primaryKey();
  public fullName = this.varchar("full_name", { size: 256 });

  public fullNameIndex = this.index(this.fullName);

  public tableName(): string {
    return "users";
  }
}

export class AuthOtpTable extends AbstractTable<AuthOtpTable> {
  public id = this.serial("id").primaryKey();
  public phone = this.varchar("phone", { size: 256 });
  public userId = this.int("user_id").foreignKey(UsersTable, (t) => t.id);

  public tableName(): string {
    return "auth_otp";
  }
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

### Installation & configuration
```bash
npm install -g drizzle-kit
```
Create a `drizzle.config.yml` configuration file:
```yaml
migrationRootFolder: drizzle ## all migrations will live here
dataFolder: './src/data'     ## where are all schema .ts files
```
  \
That's it, you're ready to go 🚀
```
> drizzle-kit migrate
```
  \
You can also run migrations in project scope
```js
// package.json
{
  ...
  scripts: {
    ...
    migrate: "drizzle-kit migrate"
  }
}

> npm run migrate
```
#### To run migrations generated by drizzle-kit you could use `Migrator` class
##### Provide drizzle-kit config path
```typescript
await drizzle.migrator(db).migrate('src/drizzle.config.yaml');
```
##### Another possibility is to provide object with path to folder with migrations
```typescript
await drizzle.migrator(db).migrate({ migrationFolder: 'drizzle' });
```


## Raw query usage
#### If you have some complex queries to execute and drizzle-orm can't handle them yet, then you could use `rawQuery` execution


##### Execute custom raw query
```typescript
const res: QueryResult<any> = await db.session().execute('SELECT * FROM users WHERE user.id = $1', [1]);
```