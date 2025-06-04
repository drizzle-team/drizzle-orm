import { drizzle as betterSqlite3Drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as libsqlDrizzle } from 'drizzle-orm/libsql';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { reset, seed } from '../src/index.ts';

const sqliteUsers = sqliteTable('users', {
	id: int().primaryKey(),
	name: text(),
	inviteId: int('invite_id').references((): SQLiteColumn => sqliteUsers.id),
});

{
	const db = betterSqlite3Drizzle('');

	await seed(db, { users: sqliteUsers });
	await reset(db, { users: sqliteUsers });
}

{
	const db = libsqlDrizzle({
		schema: { sqliteUsers },
		connection: {
			url: 'libsql://testturso-oleksiikh0240.turso.io',
		},
	});

	await reset(db, { sqliteUsers });

	await seed(db, { sqliteUsers });
}
