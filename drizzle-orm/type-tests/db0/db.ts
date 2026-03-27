import type { Database } from 'db0';
import { type Equal, Expect } from 'type-tests/utils';
import { drizzle, type Db0Database } from '~/db0/index.ts';
import { int, sqliteTable, text } from '~/sqlite-core/index.ts';
import { pgTable, serial, varchar } from '~/pg-core/index.ts';

declare const db0Client: Database;

// Test: drizzle function returns Db0Database with $client
const db = drizzle(db0Client);
Expect<Equal<typeof db.$client, Database>>();

// Test: drizzle with config object
const dbWithConfig = drizzle({ client: db0Client, logger: true });
Expect<Equal<typeof dbWithConfig.$client, Database>>();

// Test: SQLite schema types
const sqliteUsers = sqliteTable('users', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email'),
});

type SqliteUser = typeof sqliteUsers.$inferSelect;
type SqliteNewUser = typeof sqliteUsers.$inferInsert;

Expect<Equal<{ id: number; name: string; email: string | null }, SqliteUser>>();
Expect<Equal<{ name: string; id?: number | undefined; email?: string | null | undefined }, SqliteNewUser>>();

// Test: PG schema types
const pgUsers = pgTable('users', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	email: varchar('email', { length: 255 }),
});

type PgUser = typeof pgUsers.$inferSelect;
type PgNewUser = typeof pgUsers.$inferInsert;

Expect<Equal<{ id: number; name: string; email: string | null }, PgUser>>();
Expect<Equal<{ name: string; id?: number | undefined; email?: string | null | undefined }, PgNewUser>>();

// Test: drizzle.mock()
const mockDb = drizzle.mock();
Expect<Equal<typeof mockDb.$client, '$client is not available on drizzle.mock()'>>();
