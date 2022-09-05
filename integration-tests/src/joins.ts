import * as drizzle from 'drizzle-orm';
import { integer, PgConnector, pgTable } from 'drizzle-orm-pg';
import { eq } from 'drizzle-orm/expressions';
import { Pool } from 'pg';

const test1 = pgTable('test1', {
	value: integer('value').notNull(),
});

const test2 = pgTable('test2', {
	value: integer('value').notNull(),
});

const test3 = pgTable('test3', {
	value: integer('value').notNull(),
});

const pool = new Pool({
	host: 'localhost',
	port: 5434,
	user: 'postgres',
	password: 'postgres',
	database: 'postgres',
});

async function main() {
	const db = await drizzle.connect(new PgConnector(pool, { test1, test2, test3 }));

	const result = await db.test1
		.select()
		.fullJoin(test2, eq(test1.value, test2.value))
		.execute();
	console.log(result);

	await pool.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
