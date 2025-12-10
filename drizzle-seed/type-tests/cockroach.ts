import { drizzle } from 'drizzle-orm/cockroach';
import type { CockroachColumn } from 'drizzle-orm/cockroach-core';
import { cockroachTable, int4, text } from 'drizzle-orm/cockroach-core';
import { reset, seed } from '../src/index.ts';

const cockroachUsers = cockroachTable('users', {
	id: int4().primaryKey(),
	name: text(),
	inviteId: int4('invite_id').references((): CockroachColumn => cockroachUsers.id),
});

{
	const db0 = drizzle('', { schema: { users: cockroachUsers } });

	await seed(db0, { users: cockroachUsers });
	await seed(db0, { users: cockroachUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db0, { users: cockroachUsers });

	const db1 = drizzle('');

	await seed(db1, { users: cockroachUsers });
	await seed(db1, { users: cockroachUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db1, { users: cockroachUsers });
}
