import pg from 'pg';
import { type Equal, Expect } from 'type-tests/utils.ts';
import { drizzle } from '~/cockroach/index.ts';
import { defineRelations } from '~/relations.ts';
import { cities, comments, posts, users } from './tables-rel.ts';

const { Pool } = pg;

const relations = defineRelations({ cities, comments, posts, users }, (r) => ({
	users: {
		city: r.one.cities({ from: r.users.cityId, to: r.cities.id, optional: false }),
		posts: r.many.posts({ from: r.users.id, to: r.posts.authorId }),
	},
	posts: {
		author: r.one.users({ from: r.posts.authorId, to: r.users.id, optional: false }),
		comments: r.many.comments({ from: r.posts.id, to: r.comments.postId }),
	},
	comments: {
		post: r.one.posts({ from: r.comments.postId, to: r.posts.id, optional: false }),
	},
	cities: {
		users: r.many.users({ from: r.cities.id, to: r.users.cityId }),
	},
}));

const pdb = new Pool({ connectionString: process.env['COCKROACH_CONNECTION_STRING'] });
const db = drizzle({ client: pdb, relations });

{
	const result = await db.query.users.findMany();

	Expect<
		Equal<{
			id: number;
			name: string;
			cityId: number;
			homeCityId: number | null;
			createdAt: Date;
		}[], typeof result>
	>();
}

{
	const result = await db.query.users.findFirst();

	Expect<
		Equal<
			{
				id: number;
				name: string;
				cityId: number;
				homeCityId: number | null;
				createdAt: Date;
			} | undefined,
			typeof result
		>
	>();
}

{
	// nested `with`, column selection and a `one` relation
	const result = await db.query.users.findMany({
		columns: { id: true, name: true },
		with: {
			city: { columns: { name: true } },
			posts: {
				columns: { title: true },
				with: {
					comments: { columns: { text: true } },
				},
			},
		},
	});

	Expect<
		Equal<{
			id: number;
			name: string;
			city: { name: string };
			posts: {
				title: string;
				comments: { text: string }[];
			}[];
		}[], typeof result>
	>();
}

{
	const result = await db.query.posts.findMany({
		columns: { id: true },
		where: { title: { like: 'a%' } },
		orderBy: { id: 'desc' },
		limit: 10,
		offset: 5,
	});

	Expect<Equal<{ id: number }[], typeof result>>();
}
