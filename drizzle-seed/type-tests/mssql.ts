import type { MsSqlColumn } from 'drizzle-orm/mssql-core';
import { int, mssqlTable, text } from 'drizzle-orm/mssql-core';
import { drizzle } from 'drizzle-orm/node-mssql';
import { reset, seed } from '../src/index.ts';

const mssqlUsers = mssqlTable('users', {
	id: int().primaryKey(),
	name: text(),
	inviteId: int('invite_id').references((): MsSqlColumn => mssqlUsers.id),
});

{
	const db = drizzle('');

	await seed(db, { users: mssqlUsers });
	await reset(db, { users: mssqlUsers });
}
