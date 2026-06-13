import mssql from 'mssql';
import { type Equal, Expect } from 'type-tests/utils.ts';
import { drizzle } from '~/node-mssql/index.ts';
import { defineRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import * as schema from './tables-rel.ts';

const conn = new mssql.ConnectionPool(process.env['MSSQL_CONNECTION_STRING']!);
const db = drizzle({ client: conn, schema });
const relationsV2 = defineRelations(schema, ({ cities, comments, many, one, posts, users }) => ({
	users: {
		city: one.cities({ from: users.cityId, to: cities.id, optional: false }),
		posts: many.posts({ from: users.id, to: posts.authorId }),
	},
	posts: {
		author: one.users({ from: posts.authorId, to: users.id }),
		comments: many.comments({ from: posts.id, to: comments.postId }),
	},
	comments: {
		author: one.users({ from: comments.authorId, to: users.id }),
	},
	cities: {
		users: many.users({ from: cities.id, to: users.cityId }),
	},
}));
const dbV2 = drizzle({ client: conn, relations: relationsV2 });

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
	const result = await dbV2.query.users.findMany({
		columns: {
			id: true,
			name: true,
		},
		where: {
			name: {
				like: '%ohn%',
			},
		},
		orderBy: {
			name: 'asc',
		},
		limit: 10,
		with: {
			city: {
				columns: {
					name: true,
				},
			},
			posts: {
				columns: {
					authorId: true,
				},
				extras: {
					lower: sql<string>`lower(${schema.posts.title})`.as('lower_name'),
				},
				with: {
					author: {
						columns: {
							id: true,
							name: true,
						},
					},
					comments: {
						columns: {
							text: true,
						},
					},
				},
			},
		},
	});

	Expect<
		Equal<
			{
				id: number;
				name: string;
				city: {
					name: string;
				};
				posts: {
					authorId: number | null;
					lower: string;
					author: {
						id: number;
						name: string;
					} | null;
					comments: {
						text: string;
					}[];
				}[];
			}[],
			typeof result
		>
	>;
}

{
	const result = await dbV2.query.users.findFirst({
		columns: {
			id: true,
		},
		with: {
			posts: true,
		},
	});

	Expect<
		Equal<
			{
				id: number;
				posts: {
					id: number;
					title: string;
					authorId: number | null;
				}[];
			} | undefined,
			typeof result
		>
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
