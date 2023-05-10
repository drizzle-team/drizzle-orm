import 'dotenv/config';
import { eq, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import util from 'node:util';
import pg from 'pg';
import * as schema from './schema';
import { posts } from './schema';

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

	const result = await db.query.users.findMany({
		include: {
			posts: {
				limit: 1,
				select: {
					title: true,
				},
				includeCustom: {
					upperTitle: sql`upper(${posts.title})`.as('lower_title'),
				},
				where: or(eq(schema.posts.id, 1), eq(schema.posts.id, 2)),
			},
		},
	});

	// const result = await db.query.users.findMany({
	// 	where: {
	// 		users: {}
	// 	}
	// 	include: {
	// 		posts: {
	// 			limit: 1,
	// 			select: {
	// 				title: true,
	// 			},
	// 			includeCustom: (posts, { sql }) => ({
	// 				upperTitle: sql`upper(${posts.title})`.as('lower_title'),
	// 			}),
	// 			where: (posts, { sql }) => sql`${posts.id} is not null`,
	// 		},
	// 	},
	// });

	console.log(util.inspect(result, { depth: null, colors: true }));

	await pool.end();
}

main();
