# Drizzle ORM + Knex.js

This is a toolchain for integrating Drizzle with [Knex.js](https://knexjs.org/).

## Using Knex as a query builder

You can define you DB schema using Drizzle and use Knex as the query builder. With this approach you benefit from schema definition and automated migrations provided by Drizzle, and you can use Knex to build your queries. This might be helpful if you have an existing Knex.js project and you want to add Drizzle features to it.

This integration is based on [official Knex TypeScript guide](https://knexjs.org/guide/#typescript).

```ts
import Knex from 'knex';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
// This line is important - it allows you to use the Knexify type
import 'drizzle-orm/knex';

const test = pgTable('test', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

declare module 'knex/types/tables' {
  interface Tables {
    test: Knexify<typeof test>;
  }
}

const db = Knex({});

const result/*: { id: number, name: string }[] */ = db('test').select();
```

## Wrapping Knex connection with Drizzle

Coming soon!
