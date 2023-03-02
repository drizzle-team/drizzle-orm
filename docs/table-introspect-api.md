# Table introspect API

## Get table information

```ts
import { getTableConfig } from 'drizzle-orm/pg-core/utils';
import { pgTable } from 'drizzle-orm/pg-core';

const table = pgTable(...);

const {
  columns,
  indexes,
  foreignKeys,
  checks,
  primaryKeys,
  name,
  schema,
} = await getTableConfig(table);
```

## Get table columns map

```ts
import { getTableColumns } from 'drizzle-orm/pg-core/utils';
import { pgTable } from 'drizzle-orm/pg-core';

const table = pgTable(...);

const columns/*: Record<string, AnyPgColumn>*/ = await getTableColumns(table);
```
