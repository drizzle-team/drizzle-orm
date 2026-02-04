Allows you to generate [typebox](https://sinclairzx81.github.io/typebox/#/) schemas from Drizzle ORM schemas.

**Features**

- Create a select schema for tables, views and enums.
- Create insert and update schemas for tables.
- Supported dialects: CockroachDB, MSSQL, MySQL, PostgreSQL, SingleStore, SQLite.

# Usage

```ts
import { pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/typebox';
import { Type } from 'typebox';
import { Value } from 'typebox/value';

const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	role: text('role', { enum: ['admin', 'user'] }).notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Schema for inserting a user - can be used to validate API requests
const insertUserSchema = createInsertSchema(users);

// Schema for updating a user - can be used to validate API requests
const updateUserSchema = createUpdateSchema(users);

// Schema for selecting a user - can be used to validate API responses
const selectUserSchema = createSelectSchema(users);

// Overriding the fields
const insertUserSchema = createInsertSchema(users, {
	role: Type.String(),
});

// Refining the fields - useful if you want to change the fields before they become nullable/optional in the final schema
const insertUserSchema = createInsertSchema(users, {
	id: (schema) => Type.Number({ ...schema, minimum: 0 }),
	role: Type.String(),
});

// Usage

const isUserValid: boolean = Value.Check(insertUserSchema, {
	name: 'John Doe',
	email: 'johndoe@test.com',
	role: 'admin',
});
```
