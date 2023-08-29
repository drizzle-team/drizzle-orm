# Drizzle ORM + Kysely

This is a toolchain for integrating Drizzle with [Kysely](https://kysely-org.github.io/kysely/).

## Using Kysely as a query builder

You can define you DB schema using Drizzle and use Kysely as the query builder. With this approach you benefit from schema definition and automated migrations provided by Drizzle, and you can use Kysely to build your queries. This might be helpful if you have an existing Kysely project and you want to add Drizzle features to it.

```ts
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Kyselify } from 'drizzle-orm/kysely';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

const test = pgTable('test', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

interface Database {
  test: Kyselify<typeof test>;
}

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool(),
  }),
});

const result/*: { id: number, name: string }[] */ = db.selectFrom('test').selectAll().execute();
```
