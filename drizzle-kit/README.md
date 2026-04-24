## Drizzle Kit

Drizzle Kit is a CLI migrator tool for Drizzle ORM. It is probably the one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.
<https://github.com/drizzle-team/drizzle-kit-mirror> - is a mirror repository for issues.

## Documentation

Check the full documentation on [the website](https://orm.drizzle.team/kit-docs/overview).

For machine-readable CLI behavior in non-interactive workflows, see [JSON mode and hints contract](./JSON_CONTRACT.md).


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

### JSON mode for automation

`drizzle-kit` supports per-command `--json` output for non-interactive callers on:

- `generate`
- `push`
- `up`
- `export`

If a command needs rename or data-loss guidance in JSON mode, pass hints with `--hints` or `--hints-file`. If the command still cannot proceed, it returns `status: "missing_hints"` so the caller can retry with more explicit input.

See [`JSON_CONTRACT.md`](./JSON_CONTRACT.md) for the supported payloads and response shapes.
