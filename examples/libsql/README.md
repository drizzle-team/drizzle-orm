# Drizzle ORM + [libSQL](https://libsql.org/)/[Turso](https://turso.tech)

This example shows how to use the Drizzle ORM with the Open Source libSQL server
and the Turso managed offering.

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

## Using Turso

For Turso, JWT authentication tokens are needed. This assumes you have already
created a database with the `turso db create` command.

Getting the database URL:

```
turso db show <database>
```

Getting auth token:

```bash
turso db tokens create <database> -e none
```

`.env`:

```plain
DATABASE_URL=libsql://...
DATABASE_AUTH_TOKEN=ey...
```
