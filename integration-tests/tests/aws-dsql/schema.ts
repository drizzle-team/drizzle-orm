import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async/db';

export const usersTable = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const postsTable = pgTable('posts', {
	id: uuid('id').primaryKey().defaultRandom(),
	content: text('content'),
	authorId: uuid('author_id').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Tables for RQB testing
export const rqbUser = pgTable('user_rqb_test', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	createdAt: timestamp('created_at', {
		mode: 'date',
		precision: 3,
	}).notNull(),
});

export const rqbPost = pgTable('post_rqb_test', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull(),
	content: text('content'),
	createdAt: timestamp('created_at', {
		mode: 'date',
		precision: 3,
	}).notNull(),
});

// Table for migration tests
export const usersMigratorTable = pgTable('users12', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

export const init = async (db: PgAsyncDatabase<any, any>) => {
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS ${rqbUser} (
			"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			"name" TEXT NOT NULL,
			"created_at" TIMESTAMP(3) NOT NULL
		)
	`);
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS ${rqbPost} (
			"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			"user_id" UUID NOT NULL,
			"content" TEXT,
			"created_at" TIMESTAMP(3) NOT NULL
		)
	`);
};

export const clear = async (db: PgAsyncDatabase<any, any>) => {
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbUser} CASCADE;`).catch(() => null);
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbPost} CASCADE;`).catch(() => null);
};
