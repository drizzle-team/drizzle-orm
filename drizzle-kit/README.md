## Replit development
Exposing `drizzle-kit` internal functions via the `drizzle-kit/api` file ([see here](./src/api.ts)) for preparing database migrations in the deploy flow.

#### Getting started
Run the below in the project root:

```bash
pnpm install && pnpm build
```

#### Development
Make any changes you require to the `drizzle-kit/api` file ([see here](./drizzle-kit/src/api.ts)), then run (from `drizzle-kit`):
```bash
pnpm build
```
This will build a `dist` file that you can import into `repl-it-web` using the `file:` by running:
```bash
cd pkg/pid2/

pnpm add @drizzle-team/drizzle-kit@file:../../../drizzle-orm/drizzle-kit/dist
```
Which should add the following to `pkg/pid2/package.json`:
```
"@drizzle-team/drizzle-kit": "file:../drizzle-orm/drizzle-kit/dist",
```
> [!NOTE]
> - After any changes to you'll need to run the build command again.
> - If you're using `drizzle-kit` in pid2 you'll also need to rebuild your pid2 build and re-upload.

#### Publishing changes
Once your changes have been made, bump the package version in `drizzle-kit/package.json`:
```
  "version": "0.31.1",
```
Then rebuild to make sure the version number is updated:
```bash
pnpm build
```
Then run the pack command via `npm`:
```
npm run pack
```
This should generate a file `package.tgz`, then run the following via `npm`:
```
npm run login
npm run publish
```
> [!NOTE]
> - In repl-it-web we scope drizzle packages to our replit-internal npm registry via the @drizzle-team scope, hence we've updated the package name to `@drizzle-team/drizzle-kit` and not just `drizzle-kit`.
> - Because we don't require the rest of `drizzle-orm` we import it via a package and not the pnpm workspace, e.g `"drizzle-orm": "0.44.1",` vs `"drizzle-orm": "workspace:./drizzle-orm/dist",`. This means we don't have to build the whole drizzle-orm library in order to make changes. If at any point we decide to import more private packages from drizzle-orm then we can revert.

## Drizzle Kit

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
npm install -D drizzle-kit
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
