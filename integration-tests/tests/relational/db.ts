import 'dotenv/config';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import util from 'node:util';
import * as schema from './tables.ts';

async function main() {
	const bdb = new Database(process.env['SQLITE_DB_PATH']!);
	const db = drizzle(bdb, { schema, logger: true });

	const result = db.query.users.findMany({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					authorId: true,
				},
				with: {
					comments: true,
				},
				extras: {
					lower: sql<string>`lower(${schema.posts.title})`.as('lower_name'),
				},
			},
		},
	});

	console.log(util.inspect(result, false, null, true));
	bdb.close();
}

main();
