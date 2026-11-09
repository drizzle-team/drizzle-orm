# SQLite: number columns holding values that aren't numbers

SQLite picks a storage class per value. A column declared `integer` or `numeric` converts text that looks like a
number on write (type affinity) and keeps everything else as it was given. Drizzle's number-typed SQLite codecs
assume the stored data is number-compatible and parse it with `Number(...)` - values that aren't are not handled.

All outputs below were measured with `better-sqlite3` on the current build.

## Setup

```ts
import Database from 'better-sqlite3';
import { defineRelations, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { blob, integer, numeric, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const items = sqliteTable('items', {
	id: integer().primaryKey(),
	count: integer(),
	price: numeric({ mode: 'number' }),
	flag: integer({ mode: 'boolean' }),
	at: integer({ mode: 'timestamp' }),
});

const relations = defineRelations({ items }, (r) => ({
	items: { self: r.many.items({ from: r.items.id, to: r.items.id }) },
}));

const db = drizzle({ client: new Database(':memory:'), relations });
db.run(sql`create table items (id integer primary key, count integer, price numeric, flag integer, at integer)`);
```

Each case writes a single row, then reads it back with:

```ts
const [row] = db.select().from(items).all(); // "select" column below
const rqb = await db.query.items.findFirst({ with: { self: true } }); // "RQB nested" column below - `rqb.self[0]`
```

## How such values get stored

1. Raw `sql` values in `insert` / `update` bypass the column's TypeScript type and encoders:

```ts
db.insert(items).values({ id: 1, count: sql`'abc'` }).run();
db.update(items).set({ count: sql`'abc'` }).run();
```

2. Schema drift - a second definition of the same table (an older schema version, another service, a hand-written
   migration that changed the column's type) writes text or blobs into the column:

```ts
const itemsAsText = sqliteTable('items', {
	id: integer().primaryKey(),
	count: text(),
	price: text(),
	flag: text(),
	at: text(),
});
const itemsAsBlob = sqliteTable('items', { id: integer().primaryKey(), count: blob({ mode: 'buffer' }) });

db.insert(itemsAsText).values({ id: 1, count: 'abc' }).run();
db.insert(itemsAsBlob).values({ id: 1, count: Buffer.from([1]) }).run();
```

## Current output

| Written | Stored as | `select` | RQB nested |
| --- | --- | --- | --- |
| `count: 'abc'` | text | `NaN` | `NaN` |
| `count: sql\`'abc'\`` | text | `NaN` | `NaN` |
| `count: ''` | text | `0` | `0` |
| `count: '0x10'` | text | `16` | `16` |
| `count: 'Infinity'` | text | `Infinity` | `Infinity` |
| `count: '2024-01-01 10:00:00'` | text | `NaN` | `NaN` |
| `count: Buffer.from([1])` | blob | `NaN` | `1` (SQLite's JSON functions turn the blob into `true`) |
| `price: 'abc'` | text | `NaN` | `NaN` |
| `price: ''` | text | `0` | `0` |
| `price: '1,5'` | text | `NaN` | `NaN` |
| `flag: 'yes'` | text | `false` | `false` |
| `at: '2024-01-01 10:00:00'` | text | `2024-01-01T08:00:00.000Z` (local time read) | same |
| `at: 'abc'` | text | `Invalid Date` | `Invalid Date` |

- `integer` parses with `Number(...)` on every driver, on both the query and the RQB JSON path.
- `Number(...)` accepts more than integer text: `'0x10'` -> `16`, `'Infinity'` -> `Infinity`, `''` -> `0`.

Text that SQLite's affinity can convert is stored as a number and reads back normally:

| Written | Stored as | `select` / RQB nested |
| --- | --- | --- |
| `count: ' 12 '` | integer | `12` |
| `flag: '1'` | integer | `true` |
| `at: '2024'` | integer | `1970-01-01T00:33:44.000Z` (2024 seconds) |

## Compared to branch head

Every `number` value - the only thing a client in its default mode returns for INTEGER storage - maps exactly as
before for `integer`, `integer:boolean`, `integer:timestamp`, `integer:timestamp_ms` and `numeric:number`.
Differences are limited to:

- `bigint` (safe integer modes) and integer text (`libsql`'s `intMode: 'string'`): now mapped to numbers, dates and
  booleans. Before, `integer` returned them as is, timestamps threw `TypeError` on `bigint` and read integer text as
  a date string (`'1700000000'` -> `Invalid Date`), booleans returned `false` for `1n`.
- Non-numeric text in `integer`: `NaN` (or `0` for `''`) instead of the text as is, in nested RQB rows as well.
- Digit-only text in timestamp columns (`'2024'`) would now be read as epoch seconds / milliseconds instead of a date
  string - unreachable for INTEGER columns, where affinity stores such text as an integer (last table above).
