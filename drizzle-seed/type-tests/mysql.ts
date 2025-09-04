import type { MySqlColumn } from 'drizzle-orm/mysql-core';
import { int, mysqlTable, text } from 'drizzle-orm/mysql-core';
import { drizzle as mysql2Drizzle } from 'drizzle-orm/mysql2';
import { drizzle as planetscaleDrizzle } from 'drizzle-orm/planetscale-serverless';
import { reset, seed } from '../src/index.ts';

const mysqlUsers = mysqlTable('users', {
	id: int().primaryKey().autoincrement(),
	name: text(),
	inviteId: int('invite_id').references((): MySqlColumn => mysqlUsers.id),
});

// mysql2
{
	const db0 = mysql2Drizzle('', { schema: { users: mysqlUsers }, mode: 'default' });

	await seed(db0, { users: mysqlUsers });
	await seed(db0, { users: mysqlUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db0, { users: mysqlUsers });

	const db1 = mysql2Drizzle('', { schema: { users: mysqlUsers }, mode: 'planetscale' });

	await seed(db1, { users: mysqlUsers });
	await seed(db1, { users: mysqlUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db1, { users: mysqlUsers });

	const db2 = mysql2Drizzle('');

	await seed(db2, { users: mysqlUsers });
	await seed(db2, { users: mysqlUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db2, { users: mysqlUsers });
}

// planetscale
{
	const db0 = planetscaleDrizzle('', { schema: { users: mysqlUsers } });

	await seed(db0, { users: mysqlUsers });
	await seed(db0, { users: mysqlUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db0, { users: mysqlUsers });

	const db1 = planetscaleDrizzle('');

	await seed(db1, { users: mysqlUsers });
	await seed(db1, { users: mysqlUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db1, { users: mysqlUsers });
}
