import { Client } from 'pg';
import { drizzle } from '~/node-postgres';

import { placeholder } from '~/sql';
import { type Equal, Expect } from '../utils';
import * as schema from './tables-rel';

export const db = drizzle(new Client(), { schema });

{
	const result = await db.query.users.findMany({
		orderBy: (users, { asc, desc }) => [asc(users.name), desc(users.id)],
		select: {
			id: true,
			name: true,
			posts: {
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
		Equal<
			{
				id: number;
				name: string;
				posts: {
					title: string;
					authorId: number;
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
								}[];
							};
						};
					}[];
					author: {
						id: number;
						name: string;
						cityId: number;
						homeCityId: number | null;
					};
				}[];
			}[],
			typeof result
		>
	>;
}

{
	const result = await db.query.users.findMany();
	Expect<
		Equal<
			{
				id: number;
				name: string;
				cityId: number;
				homeCityId: number | null;
			}[],
			typeof result
		>
	>;
}

{
	const result = await db.query.users.findMany({
		includeCustom: (users, { sql }) => ({
			nameLower: sql<string>`lower(${users.name})`.as('name_lower'),
		}),
	});
	Expect<
		Equal<
			{
				id: number;
				name: string;
				cityId: number;
				homeCityId: number | null;
				nameLower: string;
			}[],
			typeof result
		>
	>;
}

{
	const result = await db.query.users.findMany({
		select: {},
		includeCustom: (users, { sql }) => ({
			nameLower: sql<string>`lower(${users.name})`.as('name_lower'),
		}),
	});
	Expect<
		Equal<
			{ nameLower: string }[],
			typeof result
		>
	>;
}
