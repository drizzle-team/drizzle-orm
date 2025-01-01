import { Database } from '@db/sqlite';
import { eq, sql } from 'drizzle-orm';
import { type DenoSQLiteDatabase, drizzle } from 'drizzle-orm/deno-sqlite';
import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { beforeAll, describe, expect, it } from 'vitest';

// Define the table
const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	json: blob('json', { mode: 'json' }).$type<string[]>(),
	bigInt: blob('big_int', { mode: 'bigint' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`strftime('%s', 'now')`),
});

// Database instance
let db: DenoSQLiteDatabase;

if (process.env['IS_DENO']) {
	beforeAll(() => {
		// Initialize the SQLite database in memory
		const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';
		const client = new Database(dbPath);
		db = drizzle(client);

		// Create the table
		db.run(sql`
			CREATE TABLE users (
			  id INTEGER PRIMARY KEY,
			  name TEXT NOT NULL,
			  verified INTEGER NOT NULL DEFAULT 0,
			  json BLOB,
			  big_int BLOB,
			  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
			)
		`);
	});

	describe('Deno SQLite Drizzle Integration', () => {
		it('should insert a user into the database', () => {
			const user = {
				id: 1,
				name: 'Alice',
				verified: 1,
				json: ['foo', 'bar'],
				bigInt: BigInt(1234567890123456789n),
				createdAt: new Date(),
			};

			db.insert(usersTable).values(user).run();

			const result = db.select().from(usersTable).where(eq(usersTable.id, 1)).get();

			expect(result).toBeDefined();
			expect(result!.name).toBe(user.name);
			expect(result!.verified).toBe(user.verified);
			expect(result!.json).toEqual(user.json);
			expect(result!.bigInt).toBe(user.bigInt);
		});

		it('should retrieve all users', () => {
			const users = db.select().from(usersTable).all();
			expect(users).toHaveLength(1);
			expect(users[0]!.name).toBe('Alice');
		});

		it('should delete a user', () => {
			db.delete(usersTable).where(eq(usersTable.id, 1)).run();
			const users = db.select().from(usersTable).all();
			expect(users).toHaveLength(0);
		});
	});
} else {
	describe.skip('Tests skipped because IS_DENO is not set');
}
