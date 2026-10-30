// Drizzle config for the LOCAL BENCH CLUSTER (test/setup-pg.sh, port 54329) — used to open
// Drizzle Studio against testdb, e.g. alongside playground/replication/watch.ts to poke rows
// and watch the CDC diffs stream. Schema is introspected from the live DB (`bun run db:pull`).
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './drizzle/schema.ts',
  out: './drizzle',
  dbCredentials: { url: 'postgresql://postgres:postgres@127.0.0.1:54329/testdb' },
})
