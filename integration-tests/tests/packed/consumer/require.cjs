const { sql } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/postgres');

async function main() {
	const db = drizzle(process.env.PG_CONNECTION_STRING);
	try {
		const result = await db.execute(sql`select ${'ok'}::text as value`);
		console.log(JSON.stringify(result.rows));
	} finally {
		await db.$client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
