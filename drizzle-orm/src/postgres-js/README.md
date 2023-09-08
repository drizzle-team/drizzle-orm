# Drizzle ORM | [Postgres.js](https://github.com/porsager/postgres) driver

## Installation

```bash
# npm
npm i drizzle-orm postgres
npm i -D drizzle-kit

# yarn
yarn add drizzle-orm postgres
yarn add -D drizzle-kit

# pnpm
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

## Connection

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(connectionString);
const db = drizzle(client);
```

See [main docs](/drizzle-orm/src/pg-core/README.md#sql-schema-declaration) for further usage.

## Running migrations

In order to run the migrations, [you need to use `max: 1` in the postgres.js connection options](https://github.com/porsager/postgres#unsafe_transaction). You can create a separate connection instance for migrations with that setting.

```typescript
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const migrationsClient = postgres(connectionString, {
  max: 1,
});
const db = drizzle(migrationsClient);
await migrate(db, { migrationsFolder: '...' });
```

See [main migrations docs](/drizzle-orm/src/pg-core/README.md#migrations) for further info.
