# DrizzleORM

**DrizzleORM** is an ORM framework for 
[TypeScript](https://www.typescriptlang.org/).
It offers you several levels of Database communication:
* Typesafe Table View approach 
* Typesafe Query Builder
* Simple SQL query execution

Drizzle ORM is highly influenced by [Exposed](https://github.com/JetBrains/Exposed) and Jetbrains development methodology

## Supported Databases

* PostgreSQL

## Links

In Progress

## Installing

```bash
npm install drizzle-orm drizzle-kit
yarn add drizzle-orm drizzle-kit
bower install drizzle-orm drizzle-kit
```

## Connecting to database

```tsx
import { DbConnector } from "drizzle-orm";

// connect via postgresql connection url
const db = await new DbConnector()
	.connectionString("postgres://user:password@host:port/db")
	.connect();

// or by params
const db = await new DbConnector()
	.params({
		host: '0.0.0.0',
		port: 5432,
		user: 'user',
		password: 'password',
		db: 'optional_db_name'
	}).connect();
```

## Creating your first table and first migration

```tsx
class UsersTable extends AbstractTable<UsersTable> {
  public id = this.int("id").primaryKey().autoIncrement();
  public name = this.varchar("name", { size: 512 });
  public email = this.varchar("email", { size: 512 }).unique();

  public tableName(): string {
    return "users";
  }
}

// lets create your first SQL migration to create initial schema

const migrator = new Migrator(db);
await migrator.runMigrations('./drizzle/migrations')
// That's it!! No metaprogramming, no black magic, everything's imperative
```

## Inserting into tables
Returned entity is of type ExtractModel<UsersTable> which does have a set of typed fields

```tsx
const email = 'email@example.com'
const name = 'Full Name'

// returns inserted user
const user = await table.insert({ email, name }).first()
```

## Simple querying with/without filters
__For more complex filtering - see `advanced querying`__

```tsx
const email = 'email@example.com'

const allUsers = await table.select().all()
const firstUser = await table.select().first()

const userWithEmail = await table.select(eq(table.email, email)).first()

// If you need to declare type explicitely
type User = ExtractModel<UsersTable>

const user: User = await table.select().first()
user.email
user.id

// Works perfectly!
```

## Joins

```tsx
class ItemsTable extends AbstractTable<ItemsTable>{
  id = this.int("id").primaryKey().autoIncrement();
  name = this.varchar("name");
	
  // many to one relation
  ownerId = this.int("owner_id").foreignKey(UsersTable, (t) => t.id); 
}

const query = usersTable.select().leftJoin(
	ItemsTable, 
	(ut) => ut.id,     // user id
	(it) => it.ownerId // item owner id
); 

const result = (await query.execute()).map((user, item) => {
	return { user, item };
});

// result would be
[{
    user: { id: 10, ... },
    item: { id: 1, ... }
},
{
    user: { id: 10, ... },
    item: { id: 2, ... }
},
{
    user: { id: 10, ... },
    item: { id: 3, ... }
},
{
    user: { id: 11, ... },
    item: { id: 4, ... }
},
{
    user: { id: 11, ... },
    item: { id: 5, ... }
}]
```
