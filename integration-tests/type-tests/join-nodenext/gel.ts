import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/gel';
import { gelTable, text, uuid } from 'drizzle-orm/gel-core';
import { expectTypeOf } from 'vitest';

const account = gelTable('accounts', {
	id: uuid('id').primaryKey().notNull(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id),
	meta: text().notNull(),
});

const users = gelTable('users', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
	username: text('username').notNull().unique(),
});

const db = drizzle.mock();

(async () => {
	const res = await db.select()
		.from(users)
		.innerJoin(account, eq(users.id, account.id));

	expectTypeOf(res).toEqualTypeOf<{
		accounts: {
			id: string;
			userId: string;
			meta: string;
		};
		users: {
			id: string;
			name: string;
			username: string;
		};
	}[]>();
});
