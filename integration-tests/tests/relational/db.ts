import 'dotenv/config';
import { placeholder } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import util from 'node:util';
import pg from 'pg';
import * as schema from './schema';

const { Pool } = pg;

async function main() {
	const pool = new Pool({ connectionString: process.env['PG_CONNECTION_STRING'] });
	const db = drizzle(pool, { schema, logger: true });

	// const result = await db.query.users.findMany({
	// 	orderBy: (users, { desc }) => [users.name, desc(users.id)],
	// 	select: {
	// 		id: true,
	// 		name: true,
	// 		posts: {
	// 			select: {
	// 				id: false,
	// 				author: true,
	// 				comments: {
	// 					where: (comments, { sql }) => sql`length(${comments.text}) > 1`,
	// 					limit: 5,
	// 					select: {
	// 						text: true,
	// 						author: {
	// 							select: {
	// 								city: {
	// 									include: {
	// 										users: {
	// 											orderBy: (users) => users.name,
	// 										},
	// 									},
	// 								},
	// 							},
	// 						},
	// 					},
	// 				},
	// 			},
	// 		},
	// 	},
	// });

	// const result = await db.query.users.findMany({
	// 	select: {
	// 		id: true,
	// 		name: true,
	// 	},
	// 	includeCustom: {
	// 		nameUpper: sql<string>`upper(${schema.users.name})`.as('name_upper'),
	// 	},
	// });

	const result = db.query.users.findMany({
		limit: placeholder('limit'),
		offset: placeholder('offset'),
		include: {
			posts: {
				limit: 1,
			},
		},
	}).prepare('query1');

	const result1 = await result.execute({ limit: 1, offset: 0 });
	const result2 = await result.execute({ limit: 1, offset: 1 });

	console.log(util.inspect(result1, { depth: null, colors: true }));
	console.log(util.inspect(result2, { depth: null, colors: true }));

	await pool.end();
}

main();
