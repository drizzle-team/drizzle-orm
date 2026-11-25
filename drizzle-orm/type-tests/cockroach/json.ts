import { Expect } from 'type-tests/utils.ts';
import { alias, cockroachTable, cockroachView, int4, text } from '~/cockroach-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { count } from '~/sql/functions/aggregate.ts';
import { sql } from '~/sql/sql.ts';
import type { DrizzleTypeError, Equal } from '~/utils.ts';
import { db } from './db.ts';

const users = cockroachTable('json_users', {
	id: int4('id').primaryKey(),
	name: text('name').notNull(),
	bio: text('bio'),
	role: text('role').$type<'admin' | 'user'>().notNull(),
});

const posts = cockroachTable('json_posts', {
	id: int4('id').primaryKey(),
	authorId: int4('author_id'),
	title: text('title').notNull(),
});

type User = { id: number; name: string; bio: string | null; role: 'admin' | 'user' };

// Field kinds
{
	const res = await db.select({
		object: sql.jsonObject({
			id: users.id,
			bio: users.bio,
			role: users.role,
			typed: sql<number>`1`,
			untyped: sql`1`,
			aliased: sql<string>`'a'`.as('aliased'),
			mapped: sql`${users.id}`.mapWith(Number),
			mappedByColumn: sql`${users.role}`.mapWith(users.role),
			aggregate: db.select({ count: count().as('count') }).from(posts).where(eq(posts.authorId, users.id)).as(
				'aggregate',
			),
			scalar: db.select({ title: posts.title }).from(posts).where(eq(posts.authorId, users.id)).as('scalar'),
			nested: sql.jsonObject({ name: users.name, deeper: sql.jsonObject({ role: users.role }) }),
		}),
	}).from(users);

	Expect<
		Equal<typeof res, {
			object: {
				id: number;
				bio: string | null;
				role: 'admin' | 'user';
				typed: number;
				untyped: unknown;
				aliased: string;
				mapped: number;
				mappedByColumn: 'admin' | 'user';
				aggregate: number | null;
				scalar: string | null;
				nested: { name: string; deeper: { role: 'admin' | 'user' } };
			};
		}[]>
	>;
}

// Sources
{
	const sq = db.select({
		id: users.id,
		bio: users.bio,
		upper: sql<string>`upper(${users.name})`.as('upper'),
	}).from(users).as('sq');
	const aliasedUsers = alias(users, 'aliased_users');

	const res = await db.select({
		table: sql.jsonObject(users),
		aliasedTable: sql.jsonObject(aliasedUsers),
		subquery: sql.jsonObject(sq),
	}).from(users).innerJoin(aliasedUsers, eq(aliasedUsers.id, users.id)).innerJoin(sq, eq(sq.id, users.id));

	Expect<
		Equal<typeof res, {
			table: User;
			aliasedTable: User;
			subquery: { id: number; bio: string | null; upper: string };
		}[]>
	>;
}

// Aliased objects
{
	const res = await db.select({
		aliased: sql.jsonObject({ id: users.id, role: users.role }).as('aliased'),
	}).from(users);

	Expect<Equal<typeof res, { aliased: { id: number; role: 'admin' | 'user' } }[]>>;
}

// Join nullability applies to fields of objects built in place
{
	const left = await db.select({
		post: sql.jsonObject({ id: posts.id, title: posts.title }),
		author: sql.jsonObject({ id: users.id, bio: users.bio }),
		aliased: sql.jsonObject({ name: users.name }).as('aliased'),
		mixed: sql.jsonObject({ title: posts.title, name: users.name }),
	}).from(posts).leftJoin(users, eq(users.id, posts.authorId));

	Expect<
		Equal<typeof left, {
			post: { id: number; title: string };
			author: { id: number | null; bio: string | null };
			aliased: { name: string | null };
			mixed: { title: string; name: string | null };
		}[]>
	>;

	const right = await db.select({
		post: sql.jsonObject({ title: posts.title }),
		author: sql.jsonObject({ name: users.name }),
	}).from(posts).rightJoin(users, eq(users.id, posts.authorId));

	Expect<Equal<typeof right, { post: { title: string | null }; author: { name: string } }[]>>;

	const inner = await db.select({
		post: sql.jsonObject({ title: posts.title }),
		author: sql.jsonObject({ name: users.name }),
	}).from(posts).innerJoin(users, eq(users.id, posts.authorId));

	Expect<Equal<typeof inner, { post: { title: string }; author: { name: string } }[]>>;

	const full = await db.select({
		post: sql.jsonObject({ title: posts.title }),
		author: sql.jsonObject({ name: users.name }),
	}).from(posts).fullJoin(users, eq(users.id, posts.authorId));

	Expect<Equal<typeof full, { post: { title: string | null }; author: { name: string | null } }[]>>;
}

// Objects selected from subqueries
{
	const sq = db.select({
		id: posts.id,
		author: sql.jsonObject({ id: users.id, role: users.role }).as('author'),
	}).from(posts).leftJoin(users, eq(users.id, posts.authorId)).as('sq');

	const fromSubquery = await db.select().from(sq);

	Expect<Equal<typeof fromSubquery, { id: number; author: { id: number | null; role: 'admin' | 'user' | null } }[]>>;

	const partial = await db.select({
		author: sq.author,
		wrapped: sql.jsonObject({ id: sq.id, author: sq.author }),
	}).from(sq);

	Expect<
		Equal<typeof partial, {
			author: { id: number | null; role: 'admin' | 'user' | null };
			wrapped: { id: number; author: { id: number | null; role: 'admin' | 'user' | null } };
		}[]>
	>;

	const unaliased = db.select({ object: sql.jsonObject({ id: users.id }) }).from(users).as('unaliased');

	Expect<
		Equal<
			typeof unaliased.object,
			DrizzleTypeError<'You cannot reference this field without assigning it an alias first - use `.as(<alias>)`'>
		>
	>;
}

// Objects of joined subqueries are `null` as a whole when the join has no match, their fields aren't nullable
{
	const author = db.select({
		id: users.id,
		object: sql.jsonObject({ id: users.id, role: users.role }).as('object'),
	}).from(users).as('author');

	const left = await db.select({
		id: posts.id,
		author: author.object,
		wrapped: sql.jsonObject({ author: author.object }),
	}).from(posts).leftJoin(author, eq(author.id, posts.authorId));

	Expect<
		Equal<typeof left, {
			id: number;
			author: { id: number; role: 'admin' | 'user' } | null;
			wrapped: { author: { id: number; role: 'admin' | 'user' } | null };
		}[]>
	>;

	const inner = await db.select({
		author: author.object,
		wrapped: sql.jsonObject({ author: author.object }),
	}).from(posts).innerJoin(author, eq(author.id, posts.authorId));

	Expect<
		Equal<typeof inner, {
			author: { id: number; role: 'admin' | 'user' };
			wrapped: { author: { id: number; role: 'admin' | 'user' } };
		}[]>
	>;

	const joined = await db.select().from(posts).leftJoin(author, eq(author.id, posts.authorId));

	Expect<
		Equal<typeof joined, {
			json_posts: { id: number; authorId: number | null; title: string };
			author: { id: number; object: { id: number; role: 'admin' | 'user' } } | null;
		}[]>
	>;

	// Nested into object of another subquery
	const nested = db.select({
		object: sql.jsonObject({ title: posts.title, author: author.object }).as('object'),
	}).from(posts).leftJoin(author, eq(author.id, posts.authorId)).as('nested');

	const fromNested = await db.select({ post: nested.object }).from(nested);

	Expect<
		Equal<typeof fromNested, { post: { title: string; author: { id: number; role: 'admin' | 'user' } | null } }[]>
	>;

	// Selected by another subquery
	const reselected = db.select({
		id: posts.id,
		author: author.object,
	}).from(posts).leftJoin(author, eq(author.id, posts.authorId)).as('reselected');

	const fromReselected = await db.select().from(reselected);

	Expect<Equal<typeof fromReselected, { id: number; author: { id: number; role: 'admin' | 'user' } | null }[]>>;

	const joinedReselected = await db.select({ author: reselected.author }).from(users).leftJoin(
		reselected,
		eq(reselected.id, users.id),
	);

	Expect<Equal<typeof joinedReselected, { author: { id: number; role: 'admin' | 'user' } | null }[]>>;

	// Lateral joins
	const lateral = db.select({
		object: sql.jsonObject({ id: users.id, role: users.role }).as('object'),
	}).from(users).where(eq(users.id, posts.authorId)).as('lateral_author');

	const leftLateral = await db.select({
		author: lateral.object,
		wrapped: sql.jsonObject({ author: lateral.object }),
	}).from(posts).leftJoinLateral(lateral, sql`true`);

	Expect<
		Equal<typeof leftLateral, {
			author: { id: number; role: 'admin' | 'user' } | null;
			wrapped: { author: { id: number; role: 'admin' | 'user' } | null };
		}[]>
	>;

	const innerLateral = await db.select({ author: lateral.object }).from(posts).innerJoinLateral(lateral, sql`true`);

	Expect<Equal<typeof innerLateral, { author: { id: number; role: 'admin' | 'user' } }[]>>;
}

// CTEs
{
	const cte = db.$with('cte').as(
		db.select({
			id: users.id,
			profile: sql.jsonObject({ name: users.name, role: users.role }).as('profile'),
		}).from(users),
	);

	const fromCte = await db.with(cte).select().from(cte);

	Expect<Equal<typeof fromCte, { id: number; profile: { name: string; role: 'admin' | 'user' } }[]>>;

	const joinedCte = await db.with(cte).select({
		title: posts.title,
		profile: cte.profile,
	}).from(posts).leftJoin(cte, eq(cte.id, posts.authorId));

	Expect<Equal<typeof joinedCte, { title: string; profile: { name: string; role: 'admin' | 'user' } | null }[]>>;
}

// Views
{
	const view = cockroachView('json_view').as((qb) =>
		qb.select({
			id: users.id,
			profile: sql.jsonObject({ name: users.name, role: users.role }).as('profile'),
		}).from(users)
	);

	const fromView = await db.select().from(view);

	Expect<Equal<typeof fromView, { id: number; profile: { name: string; role: 'admin' | 'user' } }[]>>;

	const joinedView = await db.select({
		profile: view.profile,
		wrapped: sql.jsonObject({ profile: view.profile }),
	}).from(posts).leftJoin(view, eq(view.id, posts.authorId));

	Expect<
		Equal<typeof joinedView, {
			profile: { name: string; role: 'admin' | 'user' } | null;
			wrapped: { profile: { name: string; role: 'admin' | 'user' } | null };
		}[]>
	>;

	const objectOfView = await db.select({ object: sql.jsonObject(view) }).from(view);

	Expect<Equal<typeof objectOfView, { object: { id: number; profile: { name: string; role: 'admin' | 'user' } } }[]>>;
}

// JSON arrays: field kinds
{
	const res = await db.select({
		ids: sql.jsonArray(users.id),
		bios: sql.jsonArray(users.bio),
		roles: sql.jsonArray(users.role),
		typed: sql.jsonArray(sql<number>`1`),
		untyped: sql.jsonArray(sql`1`),
		aliasedItems: sql.jsonArray(sql<string>`'a'`.as('item')),
		mapped: sql.jsonArray(sql`${users.id}`.mapWith(Number)),
		mappedByColumn: sql.jsonArray(sql`${users.role}`.mapWith(users.role)),
		scalars: sql.jsonArray(
			db.select({ title: posts.title }).from(posts).where(eq(posts.authorId, users.id)).as('scalars'),
		),
		objects: sql.jsonArray(sql.jsonObject({ id: users.id, role: users.role })),
		tables: sql.jsonArray(sql.jsonObject(users)),
		inObject: sql.jsonObject({ names: sql.jsonArray(users.name) }),
	}).from(users);

	Expect<
		Equal<typeof res, {
			ids: number[];
			bios: (string | null)[];
			roles: ('admin' | 'user')[];
			typed: number[];
			untyped: unknown[];
			aliasedItems: string[];
			mapped: number[];
			mappedByColumn: ('admin' | 'user')[];
			scalars: (string | null)[];
			objects: { id: number; role: 'admin' | 'user' }[];
			tables: User[];
			inObject: { names: string[] };
		}[]>
	>;
}

// Aliased arrays
{
	const res = await db.select({ aliased: sql.jsonArray(users.role).as('aliased') }).from(users);

	Expect<Equal<typeof res, { aliased: ('admin' | 'user')[] }[]>>;
}

// Join nullability applies to elements of arrays aggregated in place
{
	const left = await db.select({
		id: users.id,
		titles: sql.jsonArray(posts.title),
		posts: sql.jsonArray(sql.jsonObject({ id: posts.id, title: posts.title })),
		mixed: sql.jsonArray(sql.jsonObject({ name: users.name, title: posts.title })),
	}).from(users).leftJoin(posts, eq(posts.authorId, users.id)).groupBy(users.id);

	Expect<
		Equal<typeof left, {
			id: number;
			titles: (string | null)[];
			posts: { id: number | null; title: string | null }[];
			mixed: { name: string; title: string | null }[];
		}[]>
	>;

	const right = await db.select({
		names: sql.jsonArray(users.name),
		titles: sql.jsonArray(posts.title),
	}).from(users).rightJoin(posts, eq(posts.authorId, users.id));

	Expect<Equal<typeof right, { names: (string | null)[]; titles: string[] }[]>>;

	const inner = await db.select({
		names: sql.jsonArray(users.name),
		titles: sql.jsonArray(posts.title),
	}).from(users).innerJoin(posts, eq(posts.authorId, users.id));

	Expect<Equal<typeof inner, { names: string[]; titles: string[] }[]>>;

	const full = await db.select({
		names: sql.jsonArray(users.name),
		titles: sql.jsonArray(posts.title),
	}).from(users).fullJoin(posts, eq(posts.authorId, users.id));

	Expect<Equal<typeof full, { names: (string | null)[]; titles: (string | null)[] }[]>>;
}

// Arrays aggregated in scalar subqueries
{
	const res = await db.select({
		id: users.id,
		titles: db.select({ titles: sql.jsonArray(posts.title).as('titles') }).from(posts).where(
			eq(posts.authorId, users.id),
		).as('titles'),
		object: sql.jsonObject({
			posts: db.select({
				posts: sql.jsonArray(sql.jsonObject({ id: posts.id, title: posts.title })).as('posts'),
			}).from(posts).where(eq(posts.authorId, users.id)).as('posts'),
		}),
	}).from(users);

	Expect<
		Equal<typeof res, {
			id: number;
			titles: string[] | null;
			object: { posts: { id: number; title: string }[] | null };
		}[]>
	>;
}

// Arrays selected from subqueries
{
	const sq = db.select({
		id: users.id,
		titles: sql.jsonArray(posts.title).as('titles'),
	}).from(users).leftJoin(posts, eq(posts.authorId, users.id)).groupBy(users.id).as('sq');

	const fromSubquery = await db.select().from(sq);

	Expect<Equal<typeof fromSubquery, { id: number; titles: (string | null)[] }[]>>;

	const partial = await db.select({
		titles: sq.titles,
		wrapped: sql.jsonObject({ titles: sq.titles }),
		nested: sql.jsonArray(sq.titles),
	}).from(sq);

	Expect<
		Equal<typeof partial, {
			titles: (string | null)[];
			wrapped: { titles: (string | null)[] };
			nested: (string | null)[][];
		}[]>
	>;

	const unaliased = db.select({ array: sql.jsonArray(users.id) }).from(users).as('unaliased');

	Expect<
		Equal<
			typeof unaliased.array,
			DrizzleTypeError<'You cannot reference this field without assigning it an alias first - use `.as(<alias>)`'>
		>
	>;
}

// Arrays of joined subqueries are `null` as a whole when the join has no match, their elements aren't nullable
{
	const titles = db.select({
		authorId: posts.authorId,
		array: sql.jsonArray(posts.title).as('array'),
	}).from(posts).groupBy(posts.authorId).as('titles');

	const left = await db.select({
		id: users.id,
		titles: titles.array,
		wrapped: sql.jsonObject({ titles: titles.array }),
	}).from(users).leftJoin(titles, eq(titles.authorId, users.id));

	Expect<
		Equal<typeof left, {
			id: number;
			titles: string[] | null;
			wrapped: { titles: string[] | null };
		}[]>
	>;

	const inner = await db.select({
		titles: titles.array,
		wrapped: sql.jsonObject({ titles: titles.array }),
	}).from(users).innerJoin(titles, eq(titles.authorId, users.id));

	Expect<Equal<typeof inner, { titles: string[]; wrapped: { titles: string[] } }[]>>;

	// Aggregated by another subquery
	const aggregated = db.select({
		id: users.id,
		all: sql.jsonArray(titles.array).as('all'),
	}).from(users).leftJoin(titles, eq(titles.authorId, users.id)).groupBy(users.id).as('aggregated');

	const fromAggregated = await db.select({ all: aggregated.all }).from(aggregated);

	Expect<Equal<typeof fromAggregated, { all: (string[] | null)[] }[]>>;

	// Nested into object of another subquery
	const nested = db.select({
		object: sql.jsonObject({ name: users.name, titles: titles.array }).as('object'),
	}).from(users).leftJoin(titles, eq(titles.authorId, users.id)).as('nested');

	const fromNested = await db.select({ user: nested.object }).from(nested);

	Expect<Equal<typeof fromNested, { user: { name: string; titles: string[] | null } }[]>>;

	// Selected by another subquery
	const reselected = db.select({
		id: users.id,
		titles: titles.array,
	}).from(users).leftJoin(titles, eq(titles.authorId, users.id)).as('reselected');

	const fromReselected = await db.select().from(reselected);

	Expect<Equal<typeof fromReselected, { id: number; titles: string[] | null }[]>>;

	// Objects of joined subqueries aggregated into arrays
	const author = db.select({
		id: users.id,
		object: sql.jsonObject({ id: users.id, role: users.role }).as('object'),
	}).from(users).as('author');

	const authors = await db.select({
		authors: sql.jsonArray(author.object),
	}).from(posts).leftJoin(author, eq(author.id, posts.authorId));

	Expect<Equal<typeof authors, { authors: ({ id: number; role: 'admin' | 'user' } | null)[] }[]>>;

	// Lateral joins
	const lateral = db.select({
		array: sql.jsonArray(posts.title).as('array'),
	}).from(posts).where(eq(posts.authorId, users.id)).as('lateral_titles');

	const leftLateral = await db.select({
		titles: lateral.array,
		wrapped: sql.jsonObject({ titles: lateral.array }),
	}).from(users).leftJoinLateral(lateral, sql`true`);

	Expect<Equal<typeof leftLateral, { titles: string[] | null; wrapped: { titles: string[] | null } }[]>>;

	const innerLateral = await db.select({ titles: lateral.array }).from(users).innerJoinLateral(lateral, sql`true`);

	Expect<Equal<typeof innerLateral, { titles: string[] }[]>>;
}

// Arrays in CTEs
{
	const cte = db.$with('cte').as(
		db.select({
			authorId: posts.authorId,
			titles: sql.jsonArray(posts.title).as('titles'),
		}).from(posts).groupBy(posts.authorId),
	);

	const fromCte = await db.with(cte).select().from(cte);

	Expect<Equal<typeof fromCte, { authorId: number | null; titles: string[] }[]>>;

	const joinedCte = await db.with(cte).select({
		name: users.name,
		titles: cte.titles,
	}).from(users).leftJoin(cte, eq(cte.authorId, users.id));

	Expect<Equal<typeof joinedCte, { name: string; titles: string[] | null }[]>>;
}

// Arrays in views
{
	const view = cockroachView('json_array_view').as((qb) =>
		qb.select({
			authorId: posts.authorId,
			titles: sql.jsonArray(posts.title).as('titles'),
		}).from(posts).groupBy(posts.authorId)
	);

	const fromView = await db.select().from(view);

	Expect<Equal<typeof fromView, { authorId: number | null; titles: string[] }[]>>;

	const joinedView = await db.select({
		titles: view.titles,
		wrapped: sql.jsonObject({ titles: view.titles }),
	}).from(users).leftJoin(view, eq(view.authorId, users.id));

	Expect<Equal<typeof joinedView, { titles: string[] | null; wrapped: { titles: string[] | null } }[]>>;
}
