import { sql } from 'drizzle-orm';
import { gelTable, integer, text, timestamptz, uuid } from 'drizzle-orm/gel-core';

export const rqbUser = gelTable('user_rqb_test', {
	_id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
	id: integer('custom_id').unique().notNull(),
	name: text().notNull(),
	createdAt: timestamptz('created_at').notNull(),
});

export const rqbPost = gelTable('post_rqb_test', {
	_id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
	id: integer('custom_id').unique().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: timestamptz('created_at').notNull(),
});
