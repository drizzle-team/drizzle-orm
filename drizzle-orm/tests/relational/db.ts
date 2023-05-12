import pg from 'pg';
import { type Equal, Expect } from 'type-tests/utils';
import { drizzle } from '~/node-postgres';
import { placeholder, sql } from '~/sql';
import * as schema from './schema';

const { Pool } = pg;

const pdb = new Pool({ connectionString: process.env['PG_CONNECTION_STRING'] });
const db = drizzle(pdb, { schema });

{
	const result = await db.query.users.findMany({
		where: (users, { sql }) => sql`char_length(${users.name} > 1)`,
		limit: placeholder('l'),
		orderBy: (users, { asc, desc }) => [asc(users.name), desc(users.id)],
		include: {
			posts: {
				where: (posts, { sql }) => sql`char_length(${posts.title} > 1)`,
				limit: placeholder('l'),
				select: {
					id: false,
					author: true,
					comments: {
						where: (comments, { sql }) => sql`char_length(${comments.text} > 1)`,
						limit: placeholder('l'),
						select: {
							text: true,
							author: {
								select: {
									city: {
										include: {
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
		select: {
			id: true,
			name: true,
			posts: {
				select: {
					authorId: true,
				},
				includeCustom: {
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
