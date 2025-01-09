# How to define custom types

Drizzle ORM has a big set of predefined column types for different SQL databases. But still there are additional types that are not supported by Drizzle ORM (yet). That could be native pg types or extension types

Here are some instructions on how to create and use your own types with Drizzle ORM

---

## Abstract view on column builder pattern in Drizzle ORM

Each type creation should use 2 classes:

- `ColumnBuilder` - class, that is responsible for generating whole set of needed fields for column creation
- `Column` - class, that is representing Columns itself, that is used in query generation, migration mapping, etc.

  Each module has it's own class, representing `ColumnBuilder` or `Column`:
- For `pg` -> `PgColumnBuilder` and `PgColumn`
- For `mysql` -> `MySqlColumnBuilder` and `MySqlColumn`
- For `sqlite` -> `SQLiteColumnBuilder` and `SQLiteColumn`

### Builder class explanation - (postgresql text data type example)

- Builder class is responsible for storing TS return type for specific database datatype and override build function to return ready to use column in table

- `TData` - extends return type for column. Current example will infer string type for current datatype used in schema definition

```typescript
export class PgTextBuilder<TData extends string = string>
  extends PgColumnBuilder<
    ColumnBuilderConfig<{ data: TData; driverParam: string }>
  >
{
  

  build<TTableName extends string>(
    table: AnyPgTable<{ name: TTableName }>,
  ): PgText<TTableName, TData> {
    return new PgText(table, this.config);
  }
}
```

> [!WARNING]
> `$pgColumnBuilderBrand` should be changed and be equal to class name for new data type builder

### Column class explanation - (postgresql text data type example)

---
Column class has set of types/functions, that could be overridden to get needed behavior for custom type

- `TData` - extends return type for column. Current example will infer string type for current datatype used in schema definition

- `getSQLType()` - function, that shows datatype name in database and will be used in migration generation

- `mapFromDriverValue()` - interceptor between database and select query execution. If you want to modify/map/change value for specific data type, it could be done here

#### Usage example for jsonb type

```typescript
override mapToDriverValue(value: TData): string {
  return JSON.stringify(value);
}
```

- `mapToDriverValue` - interceptor between user input for insert/update queries and database query. If you want to modify/map/change value for specific data type, it could be done here

#### Usage example for int type

```typescript
override mapFromDriverValue(value: number | string): number {
  if (typeof value === 'string') {
    return parseInt(value);
  }
  return value;
}
```

#### Column class example

```typescript
export class PgText<TTableName extends string, TData extends string>
  extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>> {
  

  constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgTextBuilder<TData>['config']) {
    super(table, builder);
  }

  getSQLType(): string {
    return 'text';
  }

  override mapFromDriverValue(value: string): TData {
    return value as TData
  }

  override mapToDriverValue(value: TData): string {
    return value
  }
}
```

> [!WARNING]
> `$pgColumnBrand` should be changed and be equal to class name for new data type

### Full text data type for PostgreSQL example

For more postgres data type examples you could check [here](/drizzle-orm/src/pg-core/columns)

```typescript
import { ColumnConfig, ColumnBuilderConfig } from 'drizzle-orm';
import { AnyPgTable } from 'drizzle-orm/pg-core';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTextBuilder<TData extends string = string>
  extends PgColumnBuilder<
    ColumnBuilderConfig<{ data: TData; driverParam: string }>
  >
{
  

  build<TTableName extends string>(
    table: AnyPgTable<{ name: TTableName }>,
  ): PgText<TTableName, TData> {
    return new PgText(table, this.config);
  }
}

export class PgText<TTableName extends string, TData extends string>
  extends PgColumn<
    ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>
  >
{
  

  constructor(
    table: AnyPgTable<{ name: TTableName }>,
    builder: PgTextBuilder<TData>['config'],
  ) {
    super(table, builder);
  }

  getSQLType(): string {
    return 'text';
  }
}

export function text<T extends string = string>(
  name: string,
): PgTextBuilder<T> {
  return new PgTextBuilder(name);
}
```

## Custom data type example

> [!NOTE]
> We will check example on pg module, but current pattern applies to all dialects, that are currently supported by Drizzle ORM

### Setting up CITEXT datatype

> [!NOTE]
> This type is available only with extensions and used for example, just to show how you could setup any data type you want. Extension support will come soon

### CITEXT data type example

```typescript
export class PgCITextBuilder<TData extends string = string> extends PgColumnBuilder<
  PgColumnBuilderHKT,
  ColumnBuilderConfig<{ data: TData; driverParam: string }>
> {
  protected $pgColumnBuilderBrand: string = 'PgCITextBuilder';
  
  build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgCIText<TTableName, TData> {
    return new PgCIText(table, this.config);
  }
}

export class PgCIText<TTableName extends string, TData extends string>
  extends PgColumn<PgColumnHKT, ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
  

  constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgCITextBuilder<TData>['config']) {
    super(table, builder);
  }

  getSQLType(): string {
    return 'citext';
  }
}

export function citext<T extends string = string>(name: string): PgCITextBuilder<T> {
  return new PgCITextBuilder(name);
}
```

#### Usage example

```typescript
const table = pgTable('table', {
  id: integer('id').primaryKey(),
  ciname: citext('ciname')
})
```

## Contributing by adding new custom types in Drizzle ORM

You could add your created custom data types to Drizzle ORM, so everyone can use it.

Each data type should be placed in separate file in `columns` folder and PR open with tag `new-data-type:pg` | `new-data-type:sqlite` | `new-data-type:mysql`

For more Contribution information - please check [CONTRIBUTING.md](../CONTRIBUTING.md)
