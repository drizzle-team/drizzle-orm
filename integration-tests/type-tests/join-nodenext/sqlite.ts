import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { expectTypeOf } from 'vitest';

const account = sqliteTable('accounts', {
	id: text('id').primaryKey().notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	meta: text().notNull(),
});

const users = sqliteTable('users', {
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
