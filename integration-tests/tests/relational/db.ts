import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import util from 'node:util';
import * as schema from './tables';

async function main() {
	const mdb = await mysql.createConnection(process.env['MYSQL_CONNECTION_STRING']!);
	await mdb.connect();
	const db = drizzle(mdb, { schema, logger: true });

	const result = await db.query.users.findMany({
		select: {
			id: true,
			name: true,
			posts: {
				select: {
					authorId: true,
					comments: true,
				},
				includeCustom: {
					lower: sql<string>`lower(${schema.posts.title})`.as('lower_name'),
				},
			},
		},
	});

	console.log(util.inspect(result, false, null, true));
	await mdb.end();
}

main();
