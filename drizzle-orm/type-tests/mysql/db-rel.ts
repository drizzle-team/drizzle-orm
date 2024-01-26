import * as mysql from 'mysql2';
import { type Equal, Expect } from 'type-tests/utils.ts';
import { drizzle } from '~/mysql2/index.ts';
import type { InferFirstRelationalResult, InferManyRelationalResult } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import * as schema from './tables-rel.ts';

const pool = mysql.createPool({});
const db = drizzle(pool, { schema, mode: 'default' });

{
	const result = await db.query.users.findMany({
		where: (users, { sql }) => sql`char_length(${users.name} > 1)`,
		limit: sql.placeholder('l'),
		orderBy: (users, { asc, desc }) => [asc(users.name), desc(users.id)],
		with: {
			posts: {
				where: (posts, { sql }) => sql`char_length(${posts.title} > 1)`,
				limit: sql.placeholder('l'),
				columns: {
					id: false,
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

{
	type UserWithTitlePosts = InferFirstRelationalResult<
		typeof schema,
		'users',
		{ with: { posts: { columns: { title: true } } } }
	>;

	Expect<
		Equal<
			{
				id: number;
				name: string;
				cityId: number;
				homeCityId: number | null;
				createdAt: Date;
				posts: {
					title: string;
				}[];
			} | undefined,
			UserWithTitlePosts
		>
	>;
	type UsersWithPosts = InferManyRelationalResult<
		typeof schema,
		'users',
		{ with: { posts: true } }
	>;

	Expect<
		Equal<
			{
				id: number;
				name: string;
				cityId: number;
				homeCityId: number | null;
				createdAt: Date;
				posts: {
					id: number;
					title: string;
					authorId: number | null;
				}[];
			}[],
			UsersWithPosts
		>
	>;

	type UsersColumns = typeof db.query.users.$inferFindManyArgs.columns;

	Expect<
		Equal<
			UsersColumns,
			{
				id?: boolean | undefined;
				name?: boolean | undefined;
				cityId?: boolean | undefined;
				homeCityId?: boolean | undefined;
				createdAt?: boolean | undefined;
			} | undefined
		>
	>;
}
