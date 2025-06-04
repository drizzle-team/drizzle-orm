import { eq } from 'drizzle-orm';
import { mysqlTable, text } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
import { expectTypeOf } from 'vitest';

const account = mysqlTable('accounts', {
	id: text('id').primaryKey().notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	meta: text().notNull(),
});

const users = mysqlTable('users', {
	id: text('id').primaryKey(),
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
