import { bigint, serial, singlestoreTable, text, timestamp } from 'drizzle-orm/singlestore-core';

export const rqbUser = singlestoreTable('user_rqb_test', {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp('created_at', {
		mode: 'date',
	}).notNull(),
});

export const rqbPost = singlestoreTable('post_rqb_test', {
	id: serial().primaryKey().notNull(),
	userId: bigint('user_id', {
		mode: 'number',
		unsigned: true,
	}).notNull(),
	content: text(),
	createdAt: timestamp('created_at', {
		mode: 'date',
	}).notNull(),
});
