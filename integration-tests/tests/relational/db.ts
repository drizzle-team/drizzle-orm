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
	// 	limit: 3,
	// 	include: {
	// 		posts: {
	// 			include: {
	// 				comments: true,
	// 			},
	// 			limit: 2,
	// 		},
	// 	},
	// });

	// const result = await db.query.users.findMany({
	// 	where: (users, { sql }) => sql`jsonb_array_length(${users.posts}) > 0`,
	// 	include: {
	// 		posts: {
	// 			where: (posts, { sql }) => sql`length(${posts.title}) > 0`,
	// 		},
	// 	},
	// });

	const result = await db.query.users.findFirst({
		where: (users, { eq }) => eq(users.id, 1),
		include: {
			posts: {
				limit: 1,
				offset: 1,
				select: {
					title: true,
					authorId: false,
				},
				includeCustom: (posts, { sql }) => ({
					upperTitle: sql`upper(${posts.title})`.as('lower_title'),
				}),
			},
		},
	});

	console.log(util.inspect(result, { depth: null, colors: true }));

	await pool.end();
}

main();
