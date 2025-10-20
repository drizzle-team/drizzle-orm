import { defineRelations } from 'drizzle-orm';
import { bigint, int, mysqlTable, serial, text, timestamp } from 'drizzle-orm/mysql-core';

export const rqbUser = mysqlTable('user_rqb_test', {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp('created_at', {
		mode: 'date',
	}).notNull(),
});

export const rqbPost = mysqlTable('post_rqb_test', {
	id: serial().primaryKey().notNull(),
	userId: bigint('user_id', {
		mode: 'number',
	}).notNull(),
	content: text(),
	createdAt: timestamp('created_at', {
		mode: 'date',
	}).notNull(),
});

export const empty = mysqlTable('empty', { id: int() });

export const relations = defineRelations({ rqbUser, rqbPost, empty }, (r) => ({
	rqbUser: {
		posts: r.many.rqbPost(),
	},
	rqbPost: {
		author: r.one.rqbUser({
			from: r.rqbPost.userId,
			to: r.rqbUser.id,
		}),
	},
}));
