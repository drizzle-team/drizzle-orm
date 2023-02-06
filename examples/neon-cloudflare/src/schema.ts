import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: text('email').notNull(),
	name: text('name'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
