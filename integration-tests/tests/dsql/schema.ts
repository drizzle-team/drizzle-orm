import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgSchema, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { DsqlAsyncDatabase } from 'drizzle-orm/pg-core/async/dsql';

export const rqbUser = pgTable('user_rqb_test', {
	id: integer().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp('created_at', {
		mode: 'date',
		precision: 3,
	}).notNull(),
});

export const rqbPost = pgTable('post_rqb_test', {
	id: integer().primaryKey().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: timestamp('created_at', {
		mode: 'date',
		precision: 3,
	}).notNull(),
});

export const postsTable = pgTable('posts', {
	id: integer().primaryKey(),
	description: text().notNull(),
	userId: integer('city_id'),
});

export const usersMigratorTable = pgTable('users12', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

export const usersTable = pgTable('users', {
	id: integer('id' as string).primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mySchema = pgSchema('mySchema');

export const usersMySchemaTable = mySchema.table('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const init = async (db: DsqlAsyncDatabase<any, any>) => {
	await db.execute(sql`
		CREATE TABLE ${rqbUser} (
		        "id" INTEGER PRIMARY KEY NOT NULL,
		        "name" TEXT NOT NULL,
		        "created_at" TIMESTAMP(3) NOT NULL
		     )
	`);
	await db.execute(sql`
		CREATE TABLE ${rqbPost} ( 
		        "id" INTEGER PRIMARY KEY NOT NULL,
		        "user_id" INT NOT NULL,
		        "content" TEXT,
		        "created_at" TIMESTAMP(3) NOT NULL
		)
	`);
};

export const clear = async (db: DsqlAsyncDatabase<any, any>) => {
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbUser} CASCADE;`).catch(() => null);
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbPost} CASCADE;`).catch(() => null);
};
