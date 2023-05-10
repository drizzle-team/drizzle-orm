import 'dotenv/config';
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

	const result = await db.query.users.findMany({
		limit: 2,
		include: {
			posts: {
				limit: 1,
			},
		},
	});

	console.log(util.inspect(result, { depth: null, colors: true }));

	await pool.end();
}

main();
