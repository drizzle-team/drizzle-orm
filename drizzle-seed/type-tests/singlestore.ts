import { drizzle } from 'drizzle-orm/singlestore';
import { int, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { reset, seed } from '../src/index.ts';

const singlestoreUsers = singlestoreTable('users', {
	id: int().primaryKey(),
	name: text(),
	inviteId: int('invite_id'),
});

{
	const db0 = drizzle('', { schema: { users: singlestoreUsers } });

	await seed(db0, { users: singlestoreUsers });
	await seed(db0, { users: singlestoreUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db0, { users: singlestoreUsers });

	const db1 = drizzle('');

	await seed(db1, { users: singlestoreUsers });
	await seed(db1, { users: singlestoreUsers }).refine((funcs) => ({
		users: {
			columns: {
				id: funcs.intPrimaryKey(),
			},
		},
	}));
	await reset(db1, { users: singlestoreUsers });
}
