<div align='center'>
<h1>drizzle-zod <a href=''><img alt='npm' src='https://img.shields.io/npm/v/drizzle-zod?label='></a></h1>
<img alt='npm' src='https://img.shields.io/npm/dm/drizzle-zod'>
<img alt='zod version' src='https://img.shields.io/npm/dependency-version/drizzle-zod/peer/zod'>
<img alt='npm bundle size' src='https://img.shields.io/bundlephobia/min/drizzle-zod'>
<a href='https://discord.gg/yfjTbVXMW4'><img alt='Discord' src='https://img.shields.io/discord/1043890932593987624'></a>
<img alt='License' src='https://img.shields.io/npm/l/drizzle-zod'>
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

`drizzle-zod` is a plugin for [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) that allows you to generate [Zod](https://github.com/colinhacks/zod) schemas from Drizzle ORM schemas.

| Database    | Insert schema | Select schema |
|:------------|:-------------:|:-------------:|
| PostgreSQL  | ✅ | ⏳ |
| MySQL       | ⏳ | ⏳ |
| SQLite      | ⏳ | ⏳ |

# Usage

```ts
import { pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod/pg';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text<'admin' | 'user'>('role').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

const newUserSchema = createInsertSchema(users);

// Transform keys to snake case
const newUserSchema = createInsertSchema(users, 'snake');

// Transform keys to camel case
const newUserSchema = createInsertSchema(users, 'camel');

// Override the fields
const newUserSchema = createInsertSchema(users, {
  role: z.string(),
});

// Refine the fields
const newUserSchema = createInsertSchema(users, (schema) => ({
  id: schema.id.positive(),
  email: schema.email.email(),
}));

const newUserSchema = createInsertSchema(users, 'snake', (schema) => ({
  created_at: schema.createdAt.min(new Date()),
}));

// Usage

const user = newUserSchema.parse({
  name: 'John Doe',
  email: 'johndoe@test.com',
  role: 'admin',
});

// Zod schema type is also inferred from the table schema, so you have full type safety
const requestSchema = newUserSchema.pick({ name: true, email: true });
```
