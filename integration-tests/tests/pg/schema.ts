import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgSchema, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { PgAsyncDatabase } from 'drizzle-orm/pg-core/async/db';

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

export const postsTable = pgTable('posts', {
	id: serial().primaryKey(),
	description: text().notNull(),
	userId: integer('city_id').references(() => usersTable.id),
});

export const usersMigratorTable = pgTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

export const usersTable = pgTable('users', {
	id: serial('id' as string).primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mySchema = pgSchema('mySchema');

export const usersMySchemaTable = mySchema.table('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const init = async (db: PgAsyncDatabase<any, any>) => {
	await db.execute(sql`
		CREATE TABLE ${rqbUser} (
		        "id" SERIAL PRIMARY KEY NOT NULL,
		        "name" TEXT NOT NULL,
		        "created_at" TIMESTAMP(3) NOT NULL
		     )
	`);
	await db.execute(sql`
		CREATE TABLE ${rqbPost} ( 
		        "id" SERIAL PRIMARY KEY NOT NULL,
		        "user_id" INT NOT NULL,
		        "content" TEXT,
		        "created_at" TIMESTAMP(3) NOT NULL
		)
	`);
};

export const clear = async (db: PgAsyncDatabase<any, any>) => {
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbUser} CASCADE;`).catch(() => null);
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbPost} CASCADE;`).catch(() => null);
};
