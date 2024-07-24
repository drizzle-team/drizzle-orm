<div align='center'>
<h1>drizzle-effect <a href=''><img alt='npm' src='https://img.shields.io/npm/v/drizzle-effect?label='></a></h1>
<img alt='npm' src='https://img.shields.io/npm/dm/drizzle-effect'>
<img alt='npm bundle size' src='https://img.shields.io/bundlephobia/min/drizzle-effect'>
<a href='https://discord.gg/yfjTbVXMW4'><img alt='Discord' src='https://img.shields.io/discord/1043890932593987624'></a>
<img alt='License' src='https://img.shields.io/npm/l/drizzle-effect'>
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

`drizzle-effect` is a plugin for [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) that allows you to generate [Effect](https://effect.website/) schemas from Drizzle ORM schemas.

| Database   | Insert schema | Select schema |
| :--------- | :-----------: | :-----------: |
| PostgreSQL |      ✅       |      ✅       |
| MySQL      |      ✅       |      ✅       |
| SQLite     |      ✅       |      ✅       |

# Usage

```ts
import { pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-effect';
import { Schema } from '@effect/schema';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Schema for inserting a user - can be used to validate API requests
const insertUserSchema = createInsertSchema(users);

// Schema for selecting a user - can be used to validate API responses
const selectUserSchema = createSelectSchema(users);

// Overriding the fields
const insertUserSchema = createInsertSchema(users, {
  role: Schema.String,
});

const emailPattern = /[^ .@]+@[^ .@]+\.[^ .@]/;

// Refining the fields - useful if you want to change the fields before they become nullable/optional in the final schema
const insertUserSchema = createInsertSchema(users, {
  id: (schema) => schema.id.pipe(Schema.positive()),
  email: (schema) => schema.email.pipe(Schema.pattern(emailPattern)),
  role: Schema.String,
});

// Usage

const user = Schema.decodeSync(insertUserSchema)({
  name: 'John Doe',
  email: 'johndoe@test.com',
  role: 'admin',
});

// Effect schema type is also inferred from the table schema, so you have full type safety.
// Additionally it is created using `Schema.Struct`, so you can do:
const requestSchema = insertUserSchema.pick('name', 'email');
```
