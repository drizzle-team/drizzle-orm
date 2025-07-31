import { sql } from 'drizzle-orm';
import { type BaseSQLiteDatabase, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const rqbUser = sqliteTable('user_rqb_test', {
	id: integer().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: integer('created_at', {
		mode: 'timestamp_ms',
	}).notNull(),
});

export const rqbPost = sqliteTable('post_rqb_test', {
	id: integer().primaryKey().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: integer('created_at', {
		mode: 'timestamp_ms',
	}).notNull(),
});

export const init = async (db: BaseSQLiteDatabase<any, any, any, any, any>) => {
	await db.run(sql`
		CREATE TABLE ${rqbUser} (
		        "id" INT PRIMARY KEY NOT NULL,
		        "name" TEXT NOT NULL,
		        "created_at" INT NOT NULL
		     )
	`);
	await db.run(sql`
		CREATE TABLE ${rqbPost} ( 
		        "id" INT PRIMARY KEY NOT NULL,
		        "user_id" INT NOT NULL,
		        "content" TEXT,
		        "created_at" INT NOT NULL
		)
	`);
};

export const clear = async (db: BaseSQLiteDatabase<any, any, any, any, any>) => {
	try {
		await db.run(sql`DROP TABLE IF EXISTS ${rqbUser};`);
	} catch {
		null;
	}
	try {
		await db.run(sql`DROP TABLE IF EXISTS ${rqbPost};`);
	} catch {
		null;
	}
};
