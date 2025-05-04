import { drizzle as betterSqlite3Drizzle } from 'drizzle-orm/better-sqlite3';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { reset, seed } from '../src/index.ts';

const mysqlUsers = sqliteTable('users', {
	id: int().primaryKey(),
	name: text(),
	inviteId: int('invite_id').references((): SQLiteColumn => mysqlUsers.id),
});

{
	const db = betterSqlite3Drizzle('');

	await seed(db, { users: mysqlUsers });
	await reset(db, { users: mysqlUsers });
}
