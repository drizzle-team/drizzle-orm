# Drizzle ORM + [libSQL](https://libsql.org/)

This example shows how to use the Drizzle ORM with libSQL.

## Quick start

```bash
cp .env.example .env
pnpm i
pnpm start
```

It will start a local server on port 3000.

### Example request

```bash
curl --request POST \
  --url http://localhost:3000/users \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "John Doe",
  "email": "john@test.com"
}'
```

## File structure

- `src/index.ts` - the main entry point
- `src/schema.ts` - defines the database schema
- `migrations` - contains the SQL migrations generated with Drizzle Kit
- `src/env.ts` - loads, validates and exports the environment variables
- `src/server.ts` - the server definition
- `src/utils.ts` - utility functions

## Migrations

- `pnpm generate` - generate a new migration based on schema changes

Migrations are run automatically when the server starts.

## Going to production

<Something about switching from a local DB to Turso?>

Getting auth token:

```bash
turso db tokens create <database> -e none
```

`.env`:

```plain
DATABASE_URL=libsql://...
DATABASE_AUTH_TOKEN=ey...
```
