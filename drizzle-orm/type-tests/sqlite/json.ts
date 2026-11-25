import { Expect } from 'type-tests/utils.ts';
import { eq } from '~/sql/expressions/index.ts';
import { count } from '~/sql/functions/aggregate.ts';
import { sql } from '~/sql/sql.ts';
import { alias, integer, sqliteTable, sqliteView, text } from '~/sqlite-core/index.ts';
import type { DrizzleTypeError, Equal } from '~/utils.ts';
import { db } from './db.ts';

const users = sqliteTable('json_users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	bio: text('bio'),
	role: text('role').$type<'admin' | 'user'>().notNull(),
});

const posts = sqliteTable('json_posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id'),
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
	const view = sqliteView('json_view').as((qb) =>
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
