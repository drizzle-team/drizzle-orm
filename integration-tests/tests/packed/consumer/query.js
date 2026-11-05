import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres';

export async function query(connectionString) {
	const db = drizzle(connectionString);
	try {
		const result = await db.execute(sql`select ${'ok'}::text as value`);
		return result.rows;
	} finally {
		await db.$client.end();
	}
}
