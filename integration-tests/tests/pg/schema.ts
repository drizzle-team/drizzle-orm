import { sql } from 'drizzle-orm';
import { integer, type PgDatabase, type PgQueryResultHKT, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

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

export const init = async (db: PgDatabase<PgQueryResultHKT, any, any, any, any>) => {
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

export const clear = async (db: PgDatabase<PgQueryResultHKT, any, any, any, any>) => {
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbUser} CASCADE;`).catch(() => null);
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbPost} CASCADE;`).catch(() => null);
};
