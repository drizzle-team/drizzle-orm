import pg from 'pg';
import { type Equal, Expect } from 'type-tests/utils.ts';
import { drizzle } from '~/node-postgres/index.ts';
import { placeholder, sql } from '~/sql/sql.ts';
import * as schema from './tables-rel.ts';

const { Pool } = pg;

const pdb = new Pool({ connectionString: process.env['PG_CONNECTION_STRING'] });
const db = drizzle(pdb, { schema });

{
	const result = await db.query.users.findMany({
		where: (users, { sql }) => sql`char_length(${users.name} > 1)`,
		limit: placeholder('l'),
		orderBy: (users, { asc, desc }) => [asc(users.name), desc(users.id)],
		with: {
			posts: {
				where: (posts, { sql }) => sql`char_length(${posts.title} > 1)`,
				limit: placeholder('l'),
				columns: {
					id: false,
				},
				with: {
					author: true,
					comments: {
						where: (comments, { sql }) => sql`char_length(${comments.text} > 1)`,
						limit: placeholder('l'),
						columns: {
							text: true,
						},
						with: {
							author: {
								columns: {},
								with: {
									city: {
										with: {
											users: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	});

	Expect<
		Equal<{
			id: number;
			name: string;
			cityId: number;
			homeCityId: number | null;
			createdAt: Date;
			posts: {
				title: string;
				authorId: number | null;
				comments: {
					text: string;
					author: {
						city: {
							id: number;
							name: string;
							users: {
								id: number;
								name: string;
								cityId: number;
								homeCityId: number | null;
								createdAt: Date;
							}[];
						};
					} | null;
				}[];
				author: {
					id: number;
					name: string;
					cityId: number;
					homeCityId: number | null;
					createdAt: Date;
				} | null;
			}[];
		}[], typeof result>
	>;
}

{
	const result = await db.query.users.findMany({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					authorId: true,
				},
				extras: {
					lower: sql<string>`lower(${schema.posts.title})`.as('lower_name'),
				},
			},
		},
	});

	Expect<
		Equal<
			{
				id: number;
				name: string;
				posts: {
					authorId: number | null;
					lower: string;
				}[];
			}[],
			typeof result
		>
	>;
}

{ // One relations can be null even if the foreign key is not nullable if they have a where clause
	const result = await db.query.notes.findMany({
		with: {
			users: true,
			posts: true,
			comments: true,
		},
	});

	Expect<
		Equal<
			{
				id: number;
				text: string;
				notableId: number;
				notableType: 'User' | 'Post' | 'Comment';
				users: {
					id: number;
					name: string;
					cityId: number;
					homeCityId: number | null;
					createdAt: Date;
				} | null; // users can be null due to the where condition
				posts: {
					id: number;
					title: string;
					authorId: number | null;
				};
				comments: {
					id: number;
					text: string;
					authorId: number | null;
					postId: number;
				};
			}[],
			typeof result
		>
	>;
}
