import { integer, sqliteTable, text } from "drizzle-orm-sqlite";

export const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

export const statItemAggregation = sqliteTable('StatItemAggregation', {
	userId: integer('user_id').primaryKey(),
	revenue: integer("revenue"),
	connectTalkbackTime: integer("connect_talkback_time"),
});