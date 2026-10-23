import { createPool } from '@drizzle-team/postgres';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres';

const client = createPool(process.env['PG_CONNECTION_STRING']!);
const db = drizzle({ client });
try {
	const query = await db.execute(sql`select ${'ok'}::text as value`);
	const batch = await db.batch([
		db.execute(sql`select 1::int as value`),
		db.execute(sql`select 2::int as value`),
	]);
	console.log(JSON.stringify({ query: query.rows, batch: batch.map((result) => result.rows) }));
} finally {
	await client.end();
}
