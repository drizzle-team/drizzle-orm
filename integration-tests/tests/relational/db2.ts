import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import util from 'node:util';
import pg from 'pg';
import * as schema from './schema2';

// const { users, posts, comments } = schema;

const { Pool } = pg;

async function main() {
	const pool = new Pool({ connectionString: process.env['PG_CONNECTION_STRING'] });
	const db = drizzle(pool, { schema, logger: true });

	// const result = await db
	// 	.select({
	// 		user: {
	// 			id: users.id,
	// 			name: users.name,
	// 		},
	// 		post: {
	// 			id: posts.id,
	// 			title: posts.title,
	// 			content: posts.content,
	// 		},
	// 		comment: {
	// 			id: comments.id,
	// 			content: comments.content,
	// 		},
	// 	})
	// 	.from(users)
	// 	.leftJoin(posts, eq(users.id, posts.authorId))
	// 	.leftJoin(comments, eq(posts.id, comments.postId));

	const result = await db.query.users.findMany({
		select: {
			id: true,
			name: true,
			posts: {
				select: {
					authorId: false,
					comments: {
						select: {
							postId: false,
							authorId: false,
						},
					},
				},
			},
		},
	});

	console.log(util.inspect(result, { depth: null, colors: true }));

	await pool.end();
}

main();
