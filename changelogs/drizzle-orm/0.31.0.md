## Breaking changes

> Note: `drizzle-orm@0.31.0` can be used with `drizzle-kit@0.22.0` or higher. The same applies to Drizzle Kit. If you run a Drizzle Kit command, it will check and prompt you for an upgrade (if needed). You can check for Drizzle Kit updates. [below](#drizzle-kit-updates-drizzle-kit0220)

### PostgreSQL indexes API was changed

The previous Drizzle+PostgreSQL indexes API was incorrect and was not aligned with the PostgreSQL documentation. The good thing is that it was not used in queries, and drizzle-kit didn't support all properties for indexes. This means we can now change the API to the correct one and provide full support for it in drizzle-kit

Previous API

- No way to define SQL expressions inside `.on`.
- `.using` and `.on` in our case are the same thing, so the API is incorrect here.
- `.asc()`, `.desc()`, `.nullsFirst()`, and `.nullsLast()` should be specified for each column or expression on indexes, but not on an index itself.

```ts
// Index declaration reference
index('name')
  .on(table.column1, table.column2, ...) or .onOnly(table.column1, table.column2, ...)
  .concurrently()
  .using(sql``) // sql expression
  .asc() or .desc()
  .nullsFirst() or .nullsLast()
  .where(sql``) // sql expression
```

Current API

```ts
// First example, with `.on()`
index('name')
  .on(table.column1.asc(), table.column2.nullsFirst(), ...) or .onOnly(table.column1.desc().nullsLast(), table.column2, ...)
  .concurrently()
  .where(sql``)
  .with({ fillfactor: '70' })

// Second Example, with `.using()`
index('name')
  .using('btree', table.column1.asc(), sql`lower(${table.column2})`, table.column1.op('text_ops'))
  .where(sql``) // sql expression
  .with({ fillfactor: '70' })
```

## New Features

### 🎉 "pg_vector" extension support

> There is no specific code to create an extension inside the Drizzle schema. We assume that if you are using vector types, indexes, and queries, you have a PostgreSQL database with the `pg_vector` extension installed.

You can now specify indexes for `pg_vector` and utilize `pg_vector` functions for querying, ordering, etc.

Let's take a few examples of `pg_vector` indexes from the `pg_vector` docs and translate them to Drizzle

#### L2 distance, Inner product and Cosine distance

```ts
// CREATE INDEX ON items USING hnsw (embedding vector_l2_ops);
// CREATE INDEX ON items USING hnsw (embedding vector_ip_ops);
// CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops);

const table = pgTable('items', {
    embedding: vector('embedding', { dimensions: 3 })
}, (table) => ({
    l2: index('l2_index').using('hnsw', table.embedding.op('vector_l2_ops'))
    ip: index('ip_index').using('hnsw', table.embedding.op('vector_ip_ops'))
    cosine: index('cosine_index').using('hnsw', table.embedding.op('vector_cosine_ops'))
}))
```

#### L1 distance, Hamming distance and Jaccard distance - added in pg_vector 0.7.0 version

```ts
// CREATE INDEX ON items USING hnsw (embedding vector_l1_ops);
// CREATE INDEX ON items USING hnsw (embedding bit_hamming_ops);
// CREATE INDEX ON items USING hnsw (embedding bit_jaccard_ops);

const table = pgTable('table', {
    embedding: vector('embedding', { dimensions: 3 })
}, (table) => ({
    l1: index('l1_index').using('hnsw', table.embedding.op('vector_l1_ops'))
    hamming: index('hamming_index').using('hnsw', table.embedding.op('bit_hamming_ops'))
    bit: index('bit_jaccard_index').using('hnsw', table.embedding.op('bit_jaccard_ops'))
}))
```

For queries, you can use predefined functions for vectors or create custom ones using the SQL template operator.

You can also use the following helpers:

```ts
import { l2Distance, l1Distance, innerProduct, 
          cosineDistance, hammingDistance, jaccardDistance } from 'drizzle-orm'

l2Distance(table.column, [3, 1, 2]) // table.column <-> '[3, 1, 2]'
l1Distance(table.column, [3, 1, 2]) // table.column <+> '[3, 1, 2]'

innerProduct(table.column, [3, 1, 2]) // table.column <#> '[3, 1, 2]'
cosineDistance(table.column, [3, 1, 2]) // table.column <=> '[3, 1, 2]'

hammingDistance(table.column, '101') // table.column <~> '101'
jaccardDistance(table.column, '101') // table.column <%> '101'
```

If `pg_vector` has some other functions to use, you can replicate implimentation from existing one we have. Here is how it can be done

```ts
export function l2Distance(
  column: SQLWrapper | AnyColumn,
  value: number[] | string[] | TypedQueryBuilder<any> | string,
): SQL {
  if (is(value, TypedQueryBuilder<any>) || typeof value === 'string') {
    return sql`${column} <-> ${value}`;
  }
  return sql`${column} <-> ${JSON.stringify(value)}`;
}
```

Name it as you wish and change the operator. This example allows for a numbers array, strings array, string, or even a select query. Feel free to create any other type you want or even contribute and submit a PR

#### Examples

Let's take a few examples of `pg_vector` queries from the `pg_vector` docs and translate them to Drizzle

```ts
import { l2Distance } from 'drizzle-orm';

// SELECT * FROM items ORDER BY embedding <-> '[3,1,2]' LIMIT 5;
db.select().from(items).orderBy(l2Distance(items.embedding, [3,1,2]))

// SELECT embedding <-> '[3,1,2]' AS distance FROM items;
db.select({ distance: l2Distance(items.embedding, [3,1,2]) })

// SELECT * FROM items ORDER BY embedding <-> (SELECT embedding FROM items WHERE id = 1) LIMIT 5;
const subquery = db.select({ embedding: items.embedding }).from(items).where(eq(items.id, 1));
db.select().from(items).orderBy(l2Distance(items.embedding, subquery)).limit(5)

// SELECT (embedding <#> '[3,1,2]') * -1 AS inner_product FROM items;
db.select({ innerProduct: sql`(${maxInnerProduct(items.embedding, [3,1,2])}) * -1` }).from(items)

// and more!
```

## 🎉 New PostgreSQL types: `point`, `line`

You can now use `point` and `line` from [PostgreSQL Geometric Types](https://www.postgresql.org/docs/current/datatype-geometric.html)

Type `point` has 2 modes for mappings from the database: `tuple` and `xy`.

- `tuple` will be accepted for insert and mapped on select to a tuple. So, the database Point(1,2) will be typed as [1,2] with drizzle.

- `xy` will be accepted for insert and mapped on select to an object with x, y coordinates. So, the database Point(1,2) will be typed as `{ x: 1, y: 2 }` with drizzle

```ts
const items = pgTable('items', {
 point: point('point'),
 pointObj: point('point_xy', { mode: 'xy' }),
});
```

Type `line` has 2 modes for mappings from the database: `tuple` and `abc`.

- `tuple` will be accepted for insert and mapped on select to a tuple. So, the database Line{1,2,3} will be typed as [1,2,3] with drizzle.

- `abc` will be accepted for insert and mapped on select to an object with a, b, and c constants from the equation `Ax + By + C = 0`. So, the database Line{1,2,3} will be typed as `{ a: 1, b: 2, c: 3 }` with drizzle.

```ts
const items = pgTable('items', {
 line: line('line'),
 lineObj: point('line_abc', { mode: 'abc' }),
});
```

## 🎉 Basic "postgis" extension support

> There is no specific code to create an extension inside the Drizzle schema. We assume that if you are using postgis types, indexes, and queries, you have a PostgreSQL database with the `postgis` extension installed.

`geometry` type from postgis extension:

```ts
const items = pgTable('items', {
  geo: geometry('geo', { type: 'point' }),
  geoObj: geometry('geo_obj', { type: 'point', mode: 'xy' }),
  geoSrid: geometry('geo_options', { type: 'point', mode: 'xy', srid: 4000 }),
});
```

**mode**
Type `geometry` has 2 modes for mappings from the database: `tuple` and `xy`.

- `tuple` will be accepted for insert and mapped on select to a tuple. So, the database geometry will be typed as [1,2] with drizzle.
- `xy` will be accepted for insert and mapped on select to an object with x, y coordinates. So, the database geometry will be typed as `{ x: 1, y: 2 }` with drizzle

**type**

The current release has a predefined type: `point`, which is the `geometry(Point)` type in the PostgreSQL PostGIS extension. You can specify any string there if you want to use some other type

# Drizzle Kit updates: `drizzle-kit@0.22.0`

> Release notes here are partially duplicated from [drizzle-kit@0.22.0]()

## New Features

### 🎉 Support for new types

Drizzle Kit can now handle:

- `point` and `line` from PostgreSQL
- `vector` from the PostgreSQL `pg_vector` extension
- `geometry` from the PostgreSQL `PostGIS` extension

### 🎉 New param in drizzle.config - `extensionsFilters`

The PostGIS extension creates a few internal tables in the `public` schema. This means that if you have a database with the PostGIS extension and use `push` or `introspect`, all those tables will be included in `diff` operations. In this case, you would need to specify `tablesFilter`, find all tables created by the extension, and list them in this parameter.

We have addressed this issue so that you won't need to take all these steps. Simply specify `extensionsFilters` with the name of the extension used, and Drizzle will skip all the necessary tables.

Currently, we only support the `postgis` option, but we plan to add more extensions if they create tables in the `public` schema.

The `postgis` option will skip the `geography_columns`, `geometry_columns`, and `spatial_ref_sys` tables
```ts
import { defineConfig } from 'drizzle-kit'

export default defaultConfig({
  dialect: "postgresql",
  extensionsFilters: ["postgis"],
})
```

## Improvements

### Update zod schemas for database credentials and write tests to all the positive/negative cases

- support full set of SSL params in kit config, provide types from node:tls connection

```ts
import { defineConfig } from 'drizzle-kit'

export default defaultConfig({
  dialect: "postgresql",
  dbCredentials: {
    ssl: true, //"require" | "allow" | "prefer" | "verify-full" | options from node:tls
  }
})
```

```ts
import { defineConfig } from 'drizzle-kit'

export default defaultConfig({
  dialect: "mysql",
  dbCredentials: {
    ssl: "", // string | SslOptions (ssl options from mysql2 package)
  }
})
```

### Normilized SQLite urls for `libsql` and `better-sqlite3` drivers

Those drivers have different file path patterns, and Drizzle Kit will accept both and create a proper file path format for each

### Updated MySQL and SQLite index-as-expression behavior

In this release MySQL and SQLite will properly map expressions into SQL query. Expressions won't be escaped in string but columns will be

```ts
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey(),
    email: text('email').notNull(),
  },
  (table) => ({
    emailUniqueIndex: uniqueIndex('emailUniqueIndex').on(sql`lower(${table.email})`),
  }),
);

```
```sql
-- before
CREATE UNIQUE INDEX `emailUniqueIndex` ON `users` (`lower("users"."email")`);

-- now
CREATE UNIQUE INDEX `emailUniqueIndex` ON `users` (lower("email"));
```

## Bug Fixes

- [BUG]: multiple constraints not added (only the first one is generated) - [#2341](https://github.com/drizzle-team/drizzle-orm/issues/2341) 
- Drizzle Studio: Error: Connection terminated unexpectedly - [#435](https://github.com/drizzle-team/drizzle-kit-mirror/issues/435)
- Unable to run sqlite migrations local - [#432](https://github.com/drizzle-team/drizzle-kit-mirror/issues/432)
- error: unknown option '--config' - [#423](https://github.com/drizzle-team/drizzle-kit-mirror/issues/423)


## How `push` and `generate` works for indexes

### Limitations

#### You should specify a name for your index manually if you have an index on at least one expression

Example

```ts
index().on(table.id, table.email) // will work well and name will be autogeneretaed
index('my_name').on(table.id, table.email) // will work well

// but

index().on(sql`lower(${table.email})`) // error
index('my_name').on(sql`lower(${table.email})`) // will work well
```

#### Push won't generate statements if these fields(list below) were changed in an existing index:

- expressions inside `.on()` and `.using()`
- `.where()` statements
- operator classes `.op()` on columns

If you are using `push` workflows and want to change these fields in the index, you would need to:

- Comment out the index
- Push
- Uncomment the index and change those fields
- Push again

For the `generate` command, `drizzle-kit` will be triggered by any changes in the index for any property in the new drizzle indexes API, so there are no limitations here.
