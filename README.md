<div align="center">
<h1>Drizzle ORM <a href=""><img alt="npm" src="https://img.shields.io/npm/v/drizzle-orm?label="></a></h1>
<img alt="npm" src="https://img.shields.io/npm/dm/drizzle-orm">
<img alt="npm bundle size" src="https://img.shields.io/bundlephobia/min/drizzle-orm">
<a href="https://discord.gg/yfjTbVXMW4" target="_blank"><img alt="Discord" src="https://img.shields.io/discord/1043890932593987624?label=Discord"></a>
<img alt="License" src="https://img.shields.io/npm/l/drizzle-orm">
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

Drizzle ORM is a TypeScript ORM for SQL databases designed with maximum type safety in mind. It comes with a [drizzle-kit](https://github.com/drizzle-team/drizzle-kit-mirror) CLI companion for automatic SQL migrations generation. Drizzle ORM is meant to be a library, not a framework. It stays as an opt-in solution all the time at any levels.
The ORM's main philosophy is "If you know SQL, you know Drizzle ORM". We follow the SQL-like syntax whenever possible, are strongly typed ground up, and fail at compile time, not in runtime.

Drizzle ORM is being battle-tested on production projects by multiple teams 🚀 Give it a try and let us know if you have any questions or feedback on [Discord](https://discord.gg/yfjTbVXMW4).

## Features

- Full type safety
- [Smart automated migrations generation](https://github.com/drizzle-team/drizzle-kit-mirror)
- No ORM learning curve
- SQL-like syntax for table definitions and queries
- Best in class fully typed joins
- Fully typed partial and non-partial selects of any complexity
- Auto-inferring of TS types for DB models for selections and insertions separately
- [Zod schema generation](/drizzle-zod/README.md)
- Zero dependencies

## Documentation

Check the full documentation on [the website](https://orm.drizzle.team)

## Supported databases
| Database        | Support |                                                   |                                                                       |
| :-------------- | :-----: | :------------------------------------------------ | :-------------------------------------------------------------------- |
| PostgreSQL      |   ✅    | [Docs](https://orm.drizzle.team/docs/quick-start) |                                                                       |
| MySQL           |   ✅    | [Docs](https://orm.drizzle.team/docs/quick-start) |                                                                       |
| SQLite          |   ✅    | [Docs](https://orm.drizzle.team/docs/quick-start) |                                                                       |
| Cloudflare D1   |   ✅    | [Docs](https://driz.li/docs-d1)                   | [Website](https://developers.cloudflare.com/d1)                       |
| libSQL          |   ✅    | [Docs](/examples/libsql/README.md)                | [Website](https://libsql.org)                                         |
| Turso           |   ✅    | [Docs](https://driz.li/docs-turso)                | [Website](https://turso.tech)                                         |
| PlanetScale     |   ✅    | [Docs](https://driz.li/docs-planetscale)          | [Website](https://planetscale.com/)                                   |
| Neon            |   ✅    | [Docs](https://driz.li/docs-neon)                 | [Website](https://neon.tech/)                                         |
| Vercel Postgres |   ✅    | [Docs](https://driz.li/docs-vercel-postgres)      | [Website](https://vercel.com/docs/storage/vercel-postgres/quickstart) |
| Supabase        |   ✅    | [Docs](https://driz.li/docs-supabase)             | [Website](https://supabase.com)                                      |
| DynamoDB        |   ⏳    |                                                   |                                                                       |
| MS SQL          |   ⏳    |                                                   |                                                                       |
| CockroachDB     |   ⏳    |                                                   |                                                                       |

## Our sponsors ❤️

<p align="center">
<a href="https://drizzle.team" target="_blank">
<img src='https://api.drizzle.team/github/sponsors/svg'/>
</a>
</p>

## Installation

```bash
npm install drizzle-orm
npm install -D drizzle-kit
```

## Feature showcase (PostgreSQL)

> **Note**: don't forget to install `pg` and `@types/pg` packages for this example to work.

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { InferModel, eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name').notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  role: text('role', { enum: ['user', 'admin'] }).default('user').notNull(),
  cityId: integer('city_id').references(() => cities.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = InferModel<typeof users>;
export type NewUser = InferModel<typeof users, 'insert'>;

export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

export type City = InferModel<typeof cities>;
export type NewCity = InferModel<typeof cities, 'insert'>;

const pool = new Pool({
  connectionString: 'postgres://user:password@host:port/db',
});

const db = drizzle(pool);

// Insert
const newUser: NewUser = {
  fullName: 'John Doe',
  phone: '+123456789',
};
const insertedUsers /* : User[] */ = await db.insert(users).values(newUser).returning();
const insertedUser = insertedUsers[0]!;

const newCity: NewCity = {
  name: 'New York',
};
const insertedCities /* : City[] */ = await db.insert(cities).values(newCity).returning();
const insertedCity = insertedCities[0]!;

// Update
const updateResult /* : { updated: Date }[] */ = await db.update(users)
  .set({ cityId: insertedCity.id, updatedAt: new Date() })
  .where(eq(users.id, insertedUser.id))
  .returning({ updated: users.updatedAt });

// Select
const allUsers /* : User[] */ = await db.select().from(users);

// Select custom fields
const upperCaseNames /* : { id: number; name: string }[] */ = await db
  .select({
    id: users.id,
    name: sql<string>`upper(${users.fullName})`,
  })
  .from(users);

// Joins
// You wouldn't BELIEVE how SMART the result type is! 😱
const allUsersWithCities = await db
  .select({
    id: users.id,
    name: users.fullName,
    city: {
      id: cities.id,
      name: cities.name,
    },
  })
  .from(users)
  .leftJoin(cities, eq(users.cityId, cities.id));

// Delete
const deletedNames /* : { name: string }[] */ = await db.delete(users)
  .where(eq(users.id, insertedUser.id))
  .returning({ name: users.fullName });
```

**See full docs for further reference:**

- [PostgreSQL](./drizzle-orm/src/pg-core/README.md)
- [MySQL](./drizzle-orm/src/mysql-core/README.md)
- [SQLite](./drizzle-orm/src/sqlite-core/README.md)
