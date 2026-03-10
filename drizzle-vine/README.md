# drizzle-vine

Generate [VineJS](https://vinejs.dev) schemas from [Drizzle ORM](https://orm.drizzle.team) table definitions.

## Install

```sh
npm install drizzle-vine @vinejs/vine drizzle-orm
```

## Usage

```ts
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-vine';
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import vine from '@vinejs/vine';

const users = pgTable('users', {
  id: serial().primaryKey(),
  name: text().notNull(),
  email: varchar({ length: 255 }).notNull(),
});

const insertSchema = createInsertSchema(users);
const validator = vine.compile(insertSchema);

const output = await validator.validate({ name: 'Alice', email: 'alice@example.com' });
```

## Known limitations

VineJS does not have native support for `bigint` or Node.js `Buffer` values. Columns of those types fall back to `vine.any()` at both the runtime and type level. If you need validation on those columns you can supply a custom schema through the refine option.

Geometric tuple types (`PgGeometry`, `PgLine`, etc.) are approximated as `vine.array(vine.number())` since VineJS has no fixed-arity tuple type.

## License

Apache-2.0
