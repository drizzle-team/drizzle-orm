# Common way of defining custom types

> [!NOTE]
> For more advanced documentation about defining custom data types in PostgreSQL and MySQL, please check [`custom-types.md`](custom-types.md).

## Examples

Best way to see, how customType definition is working - is to check how existing data types in postgres and mysql could be defined using `customType` function from Drizzle ORM

### Postgres Data Types using `node-postgres` driver

---

#### **Serial**

```typescript
const customSerial = customType<{ data: number; notNull: true; default: true }>(
  {
    dataType() {
      return 'serial';
    },
  },
);
```

#### **Text**

```typescript
const customText = customType<{ data: string }>({
  dataType() {
    return 'text';
  },
});
```

#### **Boolean**

```typescript
const customBoolean = customType<{ data: boolean }>({
  dataType() {
    return 'boolean';
  },
});
```

#### **Jsonb**

```typescript
const customJsonb = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'jsonb';
    },
    toDriver(value: TData): string {
      return JSON.stringify(value);
    },
  })(name);
```

#### **Timestamp**

```typescript
const customTimestamp = customType<
  {
    data: Date;
    driverData: string;
    config: { withTimezone: boolean; precision?: number };
  }
>({
  dataType(config) {
    const precision = typeof config.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamp${precision}${
      config.withTimezone ? ' with time zone' : ''
    }`;
  },
  fromDriver(value: string): Date {
    return new Date(value);
  },
});
```

#### Usage for all types will be same as defined functions in Drizzle ORM

```typescript
const usersTable = pgTable('users', {
  id: customSerial('id').primaryKey(),
  name: customText('name').notNull(),
  verified: customBoolean('verified').notNull().default(false),
  jsonb: customJsonb<string[]>('jsonb'),
  createdAt: customTimestamp('created_at', { withTimezone: true }).notNull()
    .default(sql`now()`),
});
```

### MySql Data Types using `mysql2` driver

---

#### **Serial**

```typescript
const customSerial = customType<{ data: number; notNull: true; default: true }>(
  {
    dataType() {
      return 'serial';
    },
  },
);
```

#### **Text**

```typescript
const customText = customType<{ data: string }>({
  dataType() {
    return 'text';
  },
});
```

#### **Boolean**

```typescript
const customBoolean = customType<{ data: boolean }>({
  dataType() {
    return 'boolean';
  },
  fromDriver(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    return value === 1;
  },
});
```

#### **Json**

```typescript
const customJson = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'json';
    },
    toDriver(value: TData): string {
      return JSON.stringify(value);
    },
  })(name);
```

#### **Timestamp**

```typescript
const customTimestamp = customType<
  { data: Date; driverData: string; config: { fsp: number } }
>({
  dataType(config) {
    const precision = typeof config.fsp !== 'undefined'
      ? ` (${config.fsp})`
      : '';
    return `timestamp${precision}`;
  },
  fromDriver(value: string): Date {
    return new Date(value);
  },
});
```

#### Usage for all types will be same as defined functions in Drizzle ORM

```typescript
const usersTable = mysqlTable('userstest', {
  id: customSerial('id').primaryKey(),
  name: customText('name').notNull(),
  verified: customBoolean('verified').notNull().default(false),
  jsonb: customJson<string[]>('jsonb'),
  createdAt: customTimestamp('created_at', { fsp: 2 }).notNull().default(
    sql`now()`,
  ),
});
```

You can check ts-doc for types and param definition

````typescript
export type CustomTypeValues = {
  /**
   * Required type for custom column, that will infer proper type model
   *
   * Examples:
   *
   * If you want your column to be `string` type after selecting/or on inserting - use `data: string`. Like `text`, `varchar`
   *
   * If you want your column to be `number` type after selecting/or on inserting - use `data: number`. Like `integer`
   */
  data: unknown;

  /**
   * Type helper, that represents what type database driver is accepting for specific database data type
   */
  driverData?: unknown;

  /**
   * What config type should be used for {@link CustomTypeParams} `dataType` generation
   */
  config?: unknown;

  /**
   * Whether the config argument should be required or not
   * @default false
   */
  configRequired?: boolean;

  /**
   * If your custom data type should be notNull by default you can use `notNull: true`
   *
   * @example
   * const customSerial = customType<{ data: number, notNull: true, default: true }>({
   *    dataType() {
   *      return 'serial';
   *    },
   * });
   */
  notNull?: boolean;

  /**
   * If your custom data type has default you can use `default: true`
   *
   * @example
   * const customSerial = customType<{ data: number, notNull: true, default: true }>({
   *    dataType() {
   *      return 'serial';
   *    },
   * });
   */
  default?: boolean;
};

export interface CustomTypeParams<T extends Partial<CustomTypeValues>> {
  /**
   * Database data type string representation, that is used for migrations
   * @example
   * ```
   * `jsonb`, `text`
   * ```
   *
   * If database data type needs additional params you can use them from `config` param
   * @example
   * ```
   * `varchar(256)`, `numeric(2,3)`
   * ```
   *
   * To make `config` be of specific type please use config generic in {@link CustomTypeValues}
   *
   * @example
   * Usage example
   * ```
   *   dataType() {
   *     return 'boolean';
   *   },
   * ```
   * Or
   * ```
   *   dataType(config) {
   *     return typeof config.length !== 'undefined' ? `varchar(${config.length})` : `varchar`;
   *   }
   * ```
   */
  dataType: (config: T['config'] | (Equal<T['configRequired'], true> extends true ? never : undefined)) => string;

  /**
   * Optional mapping function, between user input and driver
   * @example
   * For example, when using jsonb we need to map JS/TS object to string before writing to database
   * ```
   * toDriver(value: TData): string {
   *   return JSON.stringify(value);
   * }
   * ```
   */
  toDriver?: (value: T['data']) => T['driverData'] | SQL;

  /**
   * Optional mapping function, that is responsible for data mapping from database to JS/TS code
   * @example
   * For example, when using timestamp we need to map string Date representation to JS Date
   * ```
   * fromDriver(value: string): Date {
   *  return new Date(value);
   * },
   * ```
   */
  fromDriver?: (value: T['driverData']) => T['data'];
}
````
