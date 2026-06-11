Allows you to generate [effect](https://effect.website/) schemas from Drizzle ORM schemas.

**Features**

- Create a select schema for tables, views and enums.
- Create insert and update schemas for tables.
- Supported dialects: CockroachDB, MSSQL, MySQL, PostgreSQL, SingleStore, SQLite.

# Usage

```ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/effect-schema';
import { Effect, Schema } from "effect";

const users = pgTable('users', {
	id: serial().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
	role: text({ enum: ['admin', 'user'] }).notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Schema for inserting a user - can be used to validate API requests
const UserInsert = createInsertSchema(users);

// Schema for updating a user - can be used to validate API requests
const UserUpdate = createUpdateSchema(users);

// Schema for selecting a user - can be used to validate API responses
const UserSelect = createSelectSchema(users);

// Overriding the fields
const UserInsert = createInsertSchema(users, {
	role: Schema.String,
});

// Refining the fields - useful if you want to change the fields before they become nullable/optional in the final schema
const UserInsert = createInsertSchema(users, {
	id: (schema) => schema.check(Schema.isGreaterThanOrEqualTo(0)),
	role: Schema.String,
});

// Usage
const program = Effect.gen(function*() {
	const parsedUser = yield* Schema.decodeUnknownEffect(UserInsert)({
		name: 'John Doe',
		email: 'johndoe@test.com',
		role: 'admin',
	});
});
```