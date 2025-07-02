import { drizzle } from 'drizzle-orm/singlestore';
import { int, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { reset, seed } from '../src/index.ts';

const singlestoreUsers = singlestoreTable('users', {
	id: int().primaryKey(),
	name: text(),
	inviteId: int('invite_id'),
});

{
	const db = drizzle('');

	await seed(db, { users: singlestoreUsers });
	await reset(db, { users: singlestoreUsers });
}
