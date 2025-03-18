import { sql } from 'drizzle-orm';
import { bigint, type MySqlDatabase, mysqlTable, serial, text, timestamp } from 'drizzle-orm/mysql-core';

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

export const init = async (db: MySqlDatabase<any, any, any, any, any, any>) => {
	await db.execute(sql`
		CREATE TABLE ${rqbUser} (
		        \`id\` SERIAL PRIMARY KEY NOT NULL,
		        \`name\` TEXT NOT NULL,
		        \`created_at\` TIMESTAMP NOT NULL
		     )
	`);
	await db.execute(sql`
		CREATE TABLE ${rqbPost} ( 
		        \`id\` SERIAL PRIMARY KEY NOT NULL,
		        \`user_id\` BIGINT(20) UNSIGNED NOT NULL,
		        \`content\` TEXT,
		        \`created_at\` TIMESTAMP NOT NULL
		)
	`);
};

export const clear = async (db: MySqlDatabase<any, any, any, any, any, any>) => {
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbUser} CASCADE;`).catch(() => null);
	await db.execute(sql`DROP TABLE IF EXISTS ${rqbPost} CASCADE;`).catch(() => null);
};
