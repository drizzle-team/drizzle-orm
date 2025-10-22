import pg from 'pg';
import { type Equal, Expect } from 'type-tests/utils.ts';
import { drizzle } from '~/cockroach/index.ts';
import { sql } from '~/sql/sql.ts';
import * as schema from './tables-rel.ts';

const { Pool } = pg;

const pdb = new Pool({ connectionString: process.env['COCKROACH_CONNECTION_STRING'] });
const db = drizzle({ client: pdb, schema });

{
	const result = await db._query.users.findMany({
		where: (users, { sql }) => sql`char_length(${users.name} > 1)`,
		limit: sql.placeholder('l'),
		orderBy: (users, { asc, desc }) => [asc(users.name), desc(users.id)],
		with: {
			posts: {
				where: (posts, { sql }) => sql`char_length(${posts.title} > 1)`,
				limit: sql.placeholder('l'),
				columns: {
					id: false,
					title: undefined,
				},
				with: {
					author: true,
					comments: {
						where: (comments, { sql }) => sql`char_length(${comments.text} > 1)`,
						limit: sql.placeholder('l'),
						columns: {
							text: true,
						},
						with: {
							author: {
								columns: {
									id: undefined,
								},
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
	const result = await db._query.users.findMany({
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
