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
	const db = drizzle('');

	await seed(db, { users: cockroachUsers });
	await reset(db, { users: cockroachUsers });
}
