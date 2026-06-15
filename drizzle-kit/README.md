## Drizzle Kit

Drizzle Kit is a CLI migrator tool for Drizzle ORM. It is probably the one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.
<https://github.com/drizzle-team/drizzle-kit-mirror> - is a mirror repository for issues.

## Documentation

Check the full documentation on [the website](https://orm.drizzle.team/kit-docs/overview).

### AI agent skills

Drizzle Kit ships installable [Agent Skills](https://skills.sh) for AI coding assistants — Claude Code, Cursor, GitHub Copilot, OpenAI Codex CLI, Gemini CLI, OpenCode, and any other tool that loads the open standard.

Install into your project's agent config:

```sh
npx drizzle-kit skills
```

Under the hood the command runs the [skills](https://skills.sh) CLI against drizzle-kit's bundled skill catalog and installs `SKILL.md` files directly into your agent's native skills directory — `.claude/skills/<slug>/SKILL.md` for Claude Code, and `.agents/skills/<slug>/SKILL.md` for Codex, Cursor, Gemini CLI, Cline, GitHub Copilot, and any other agent that follows the universal `AGENTS.md` skills convention.

TanStack Intent users can still surface the same skills via `intent list` — `SKILL.md` files remain bundled in the npm tarball.

### MCP server

`drizzle-kit mcp` starts a Model Context Protocol server over stdio, exposing drizzle-kit's migration lifecycle (`generate`, `push`, `check`) as MCP tools to any MCP-capable agent. Launch it from the project root so config resolution defaults to the right working directory:

```sh
npx drizzle-kit mcp
```

See your MCP client's docs for how to add a server. For details, see [MCP.md](./MCP.md).

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
