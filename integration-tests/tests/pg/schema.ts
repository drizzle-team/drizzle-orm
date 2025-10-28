import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const rqbUser = pgTable('user_rqb_test', {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp('created_at', {
		mode: 'date',
		precision: 3,
	}).notNull(),
});

export const rqbPost = pgTable('post_rqb_test', {
	id: serial().primaryKey().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: timestamp('created_at', {
		mode: 'date',
		precision: 3,
	}).notNull(),
});
