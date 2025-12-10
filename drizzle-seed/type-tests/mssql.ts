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
	const db0 = drizzle('', { schema: { users: mssqlUsers } });

	await seed(db0, { users: mssqlUsers });
	await seed(db0, { users: mssqlUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db0, { users: mssqlUsers });

	const db1 = drizzle('');

	await seed(db1, { users: mssqlUsers });
	await seed(db1, { users: mssqlUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db1, { users: mssqlUsers });
}
