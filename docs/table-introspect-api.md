# Table introspect API

## Get table information

```ts
import { pgTable, getTableConfig } from 'drizzle-orm/pg-core';

const table = pgTable(...);

const {
  columns,
  indexes,
  foreignKeys,
  checks,
  primaryKeys,
  name,
  schema,
} = getTableConfig(table);
```

## Get table columns map

```ts
import { pgTable, getTableColumns } from 'drizzle-orm/pg-core';

const table = pgTable('table', {
  id: integer('id').primaryKey(),
  name: text('name'),
});

const columns/*: { id: ..., name: ... } */ = getTableColumns(table);
```
