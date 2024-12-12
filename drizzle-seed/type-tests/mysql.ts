import type { MySqlColumn } from 'drizzle-orm/mysql-core';
import { int, mysqlTable, text } from 'drizzle-orm/mysql-core';
import { drizzle as mysql2Drizzle } from 'drizzle-orm/mysql2';
import { reset, seed } from '../src/index.ts';

const mysqlUsers = mysqlTable('users', {
	id: int().primaryKey().autoincrement(),
	name: text(),
	inviteId: int('invite_id').references((): MySqlColumn => mysqlUsers.id),
});

{
	const db = mysql2Drizzle('');

	await seed(db, { users: mysqlUsers });
	await reset(db, { users: mysqlUsers });
}
