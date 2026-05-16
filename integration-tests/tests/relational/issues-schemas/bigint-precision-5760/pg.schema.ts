import { relations } from 'drizzle-orm';
import { bigint, bigserial, pgTable, text } from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', {
	id: bigint('id', { mode: 'bigint' }).primaryKey(),
	name: text('name').notNull(),
});

export const postsTable = pgTable('posts', {
	id: bigint('id', { mode: 'bigint' }).primaryKey(),
	title: text('title').notNull(),
	authorId: bigint('author_id', { mode: 'bigint' })
		.notNull()
		.references(() => usersTable.id),
});

export const serialsTable = pgTable('serials', {
	id: bigserial('id', { mode: 'bigint' }).primaryKey(),
	label: text('label').notNull(),
	ownerId: bigint('owner_id', { mode: 'bigint' })
		.notNull()
		.references(() => usersTable.id),
});

export const usersRelations = relations(usersTable, ({ many }) => ({
	posts: many(postsTable),
	serials: many(serialsTable),
}));

export const postsRelations = relations(postsTable, ({ one }) => ({
	author: one(usersTable, {
		fields: [postsTable.authorId],
		references: [usersTable.id],
	}),
}));

export const serialsRelations = relations(serialsTable, ({ one }) => ({
	owner: one(usersTable, {
		fields: [serialsTable.ownerId],
		references: [usersTable.id],
	}),
}));
