# Drizzle ORM + [libSQL]/[Turso]

This example shows how to use the Drizzle ORM with the Open Source libSQL server
and the Turso managed offering.

## Quick start

### Set up the environment

Establish environment settings for the local server:

```bash
cp .env.example .env
```

The contents of `.env` now refer to a SQLite database file in the current
directory:

```
DATABASE_URL=file:local.db
```

### Start a local HTTP server

Install modules required by the local server:

```bash
pnpm i
```

Start the local HTTP server on port 3000, which will create the database and
perform a [migration to add two tables][migration]:

```bash
pnpm start
```

### Make queries

Make a request to add a new row to the `users` table:

```bash
curl --request POST \
  --url http://localhost:3000/users \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "John Doe",
  "email": "john@test.com"
}'
```

Fetch all the users as JSON:

```bash
curl --url http://localhost:3000/users
```

Stop the server with ctrl-C.

## Switch from local SQLite to remote Turso

You must have the [Turso CLI] installed and authenticated to create and manage a
Turso database.

### Set up the Turso database

Create a new database:

```bash
turso db create drizzle-example
```

### Change the .env file to use the Turso database

Run this command to get the database URL:

```bash
turso db show drizzle-example --url
```

Edit .env and copy the database URL into the DATABASE_URL value:

```
DATABASE_URL=libsql://[your-database]-[your-github].turso.io
```

### Add a variable for the database auth token

For Turso, an authentication token is required in order for the [libSQL
TypeScript client library] to connect.  Run this command to generate a new
non-expiring token:

```bash
turso db tokens create drizzle-example
```

Add a new line to .env and add the value to a new variable called
`DATABASE_AUTH_TOKEN`:

```plain
DATABASE_AUTH_TOKEN=[your-auth-token]
```

### Start the server

Start the server again, this time connecting to Turso instead of using a local
file:

```bash
pnpm start
```

Repeat the curl commands above to add a new row to users and fetch it.

Check that the row exists in Turso using the Turso CLI shell:

```bash
turso db shell drizzle-example "select * from users"
```

## File structure

- [`src/index.ts`](src/index.ts) - the main entry point
- [`src/schema.ts`](src/schema.ts) - defines the database schema
- [`migrations`](migrations) - contains the SQL migrations generated with Drizzle Kit
- [`src/env.ts`](src/env.ts) - loads, validates and exports the environment variables
- [`src/server.ts`](src/server.ts) - the server definition
- [`src/utils.ts`](src/utils.ts) - utility functions

## Migrations

- `pnpm generate` - generate a new migration based on schema changes

Migrations are run automatically when the server starts.


[libSQL]: https://libsql.org
[Turso]: https://turso.tech
[migration]: ./migrations/0000_clear_shockwave.sql
[Turso CLI]: https://docs.turso.tech/reference/turso-cli
[libSQL TypeScript client library]: https://docs.turso.tech/reference/client-access/javascript-typescript-sdk
