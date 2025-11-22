## @weweb/drizzle-kit

This is a WeWeb fork of Drizzle Kit that exposes additional programmatic APIs for database introspection.

**Original Repository**: [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)
**Fork Repository**: [weweb-team/drizzle-orm](https://github.com/weweb-team/drizzle-orm)

### What's Different?

This fork adds public API functions to programmatically introspect databases and compare schemas in memory, without requiring TypeScript schema files. This is useful for:

- Comparing two live databases
- Generating migrations between database instances
- Database schema diffing tools

### New API Exports

```typescript
import {
  introspectPostgres,
  introspectMySQL,
  introspectSQLite,
  introspectSingleStore,
  generateMigration,
  type DB,
  type SQLiteDB,
  type PgSchemaInternal,
  type MySqlSchemaInternal,
  type SQLiteSchemaInternal,
  type SingleStoreSchemaInternal
} from '@weweb/drizzle-kit/api';
```

### Usage Examples

#### Compare Two PostgreSQL Databases

```typescript
import { Pool } from 'pg';
import { introspectPostgres, generateMigration } from '@weweb/drizzle-kit/api';
import { originUUID } from '@weweb/drizzle-kit/src/global';
import type { DB } from '@weweb/drizzle-kit/api';

const pool1 = new Pool({ connectionString: 'postgresql://localhost:5432/db1' });
const pool2 = new Pool({ connectionString: 'postgresql://localhost:5432/db2' });

const db1: DB = {
  query: async (sql: string, params?: any[]) => {
    const res = await pool1.query(sql, params);
    return res.rows;
  }
};

const db2: DB = {
  query: async (sql: string, params?: any[]) => {
    const res = await pool2.query(sql, params);
    return res.rows;
  }
};

const schema1Internal = await introspectPostgres(
  db1,
  () => true,  // Include all tables
  [],          // All schemas (empty array = no filter)
  undefined    // No entity filters
);

const schema2Internal = await introspectPostgres(db2, () => true, []);

const schema1 = { id: originUUID, prevId: '', ...schema1Internal };
const schema2 = { id: originUUID, prevId: '', ...schema2Internal };

const sqlStatements = await generateMigration(schema1, schema2);

console.log('Migration SQL from db1 to db2:');
sqlStatements.forEach(stmt => console.log(stmt));

await pool1.end();
await pool2.end();
```

#### Compare Two MySQL Databases

```typescript
import mysql from 'mysql2/promise';
import { introspectMySQL, generateMigration } from '@weweb/drizzle-kit/api';
import type { DB } from '@weweb/drizzle-kit/api';

const conn1 = await mysql.createConnection({ host: 'localhost', user: 'root', database: 'db1' });
const conn2 = await mysql.createConnection({ host: 'localhost', user: 'root', database: 'db2' });

const db1: DB = {
  query: async (sql: string) => {
    const [rows] = await conn1.execute(sql);
    return rows as any[];
  }
};

const db2: DB = {
  query: async (sql: string) => {
    const [rows] = await conn2.execute(sql);
    return rows as any[];
  }
};

const schema1 = await introspectMySQL(db1, 'db1', () => true);
const schema2 = await introspectMySQL(db2, 'db2', () => true);

const sqlStatements = await generateMigration(
  { id: originUUID, prevId: '', ...schema1 },
  { id: originUUID, prevId: '', ...schema2 }
);

console.log('MySQL Migration:', sqlStatements);
```

#### Introspect with Filters

```typescript
const schema = await introspectPostgres(
  db,
  (tableName) => tableName.startsWith('user_'), // Only tables starting with 'user_'
  ['public', 'auth'],                           // Only 'public' and 'auth' schemas
  undefined
);
```

### API Reference

#### `introspectPostgres(db, tablesFilter?, schemaFilters?, entities?, progressCallback?)`

Introspects a PostgreSQL database and returns its schema.

- `db`: Database query interface `{ query: (sql, params?) => Promise<any[]> }`
- `tablesFilter`: Optional function to filter tables `(tableName: string) => boolean`
- `schemaFilters`: Array of schema names to include (empty = all schemas)
- `entities`: Optional entity filters for roles
- `progressCallback`: Optional progress callback

#### `introspectMySQL(db, schemaName, tablesFilter?, progressCallback?)`

Introspects a MySQL database.

- `db`: Database query interface
- `schemaName`: Database/schema name
- `tablesFilter`: Optional function to filter tables
- `progressCallback`: Optional progress callback

#### `introspectSQLite(db, tablesFilter?, progressCallback?)`

Introspects a SQLite database.

- `db`: SQLite database interface `{ query: (sql) => Promise<any[]>, run: (sql) => Promise<void> }`
- `tablesFilter`: Optional function to filter tables
- `progressCallback`: Optional progress callback

#### `introspectSingleStore(db, schemaName, tablesFilter?, progressCallback?)`

Introspects a SingleStore database (same API as MySQL).

---

## Original Drizzle Kit Documentation

Drizzle Kit is a CLI migrator tool for Drizzle ORM. It is probably the one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.
<https://github.com/drizzle-team/drizzle-kit-mirror> - is a mirror repository for issues.

## Documentation

Check the full documentation on [the website](https://orm.drizzle.team/kit-docs/overview).

### How it works

Drizzle Kit traverses a schema module and generates a snapshot to compare with the previous version, if there is one.
Based on the difference, it will generate all needed SQL migrations. If there are any cases that can't be resolved automatically, such as renames, it will prompt the user for input.

For example, for this schema module:

```typescript
// src/db/schema.ts

import { integer, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

const users = pgTable("users", {
    id: serial("id").primaryKey(),
    fullName: varchar("full_name", { length: 256 }),
  }, (table) => ({
    nameIdx: index("name_idx", table.fullName),
  })
);

export const authOtp = pgTable("auth_otp", {
  id: serial("id").primaryKey(),
  phone: varchar("phone", { length: 256 }),
  userId: integer("user_id").references(() => users.id),
});
```

It will generate:

```SQL
CREATE TABLE IF NOT EXISTS auth_otp (
 "id" SERIAL PRIMARY KEY,
 "phone" character varying(256),
 "user_id" INT
);

CREATE TABLE IF NOT EXISTS users (
 "id" SERIAL PRIMARY KEY,
 "full_name" character varying(256)
);

DO $$ BEGIN
 ALTER TABLE auth_otp ADD CONSTRAINT auth_otp_user_id_fkey FOREIGN KEY ("user_id") REFERENCES users(id);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS users_full_name_index ON users (full_name);
```

### Installation & configuration

```shell
npm install -D @weweb/drizzle-kit
```

Running with CLI options:

```jsonc
// package.json
{
 "scripts": {
  "generate": "drizzle-kit generate --out migrations-folder --schema src/db/schema.ts"
 }
}
```

```shell
npm run generate
```
