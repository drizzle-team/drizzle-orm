// Fixture of `tests/displayed-types.test.ts`: tests displayed type text
import { alias, integer, pgTable, pgView, text } from '~/pg-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { count } from '~/sql/functions/aggregate.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

const users = pgTable('dt_users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	bio: text('bio'),
});

const posts = pgTable('dt_posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id'),
	title: text('title').notNull(),
});

// Selection of whole tables
export const singleTable = await db.select().from(users);
export const leftJoined = await db.select().from(users).leftJoin(posts, eq(posts.authorId, users.id));
export const rightJoined = await db.select().from(users).rightJoin(posts, eq(posts.authorId, users.id));
export const innerJoined = await db.select().from(users).innerJoin(posts, eq(posts.authorId, users.id));
export const aliasedTable = await db.select().from(alias(users, 'dt_users_alias'));

// Partial selection
export const partialColumns = await db.select({ id: users.id, bio: users.bio }).from(users);
export const partialJoinedColumns = await db.select({ name: users.name, title: posts.title })
	.from(users)
	.leftJoin(posts, eq(posts.authorId, users.id));
export const partialTables = await db.select({ user: users, post: posts })
	.from(users)
	.leftJoin(posts, eq(posts.authorId, users.id));
export const partialGroups = await db.select({
	sameTable: { id: users.id, name: users.name },
	mixedTables: { name: users.name, title: posts.title },
	sqlOnly: { one: sql<number>`1`, two: sql<number>`2`.as('two') },
}).from(posts).leftJoin(users, eq(posts.authorId, users.id));
export const partialSql = await db.select({
	typed: sql<number>`1`,
	untyped: sql`1`,
	aliased: sql<string>`'a'`.as('aliased'),
	mapped: sql`1`.mapWith(Number),
	aggregate: count(),
}).from(users);
export const partialScalarSubquery = await db.select({
	id: posts.id,
	author: db.select({ name: users.name }).from(users).where(eq(users.id, posts.authorId)).as('author'),
}).from(posts);

// JSON objects
export const jsonObjects = await db.select({
	object: sql.jsonObject({
		id: users.id,
		bio: users.bio,
		upper: sql<string>`upper(${users.name})`.as('upper'),
		mapped: sql`${users.id}`.mapWith(users.id),
		scalar: db.select({ title: posts.title }).from(posts).where(eq(posts.authorId, users.id)).as('scalar'),
		nested: sql.jsonObject({ name: users.name }),
	}),
	aliased: sql.jsonObject({ name: users.name }).as('aliased'),
	table: sql.jsonObject(users),
}).from(users);
export const joinedJsonObjects = await db.select({
	post: sql.jsonObject({ title: posts.title }),
	author: sql.jsonObject({ id: users.id, bio: users.bio }),
}).from(posts).leftJoin(users, eq(posts.authorId, users.id));

// JSON arrays
export const jsonArrays = await db.select({
	ids: sql.jsonArray(users.id),
	bios: sql.jsonArray(users.bio),
	objects: sql.jsonArray(sql.jsonObject({ id: users.id, bio: users.bio })),
	aliased: sql.jsonArray(users.name).as('aliased'),
	inObject: sql.jsonObject({ names: sql.jsonArray(users.name) }),
	scalar: db.select({ titles: sql.jsonArray(posts.title).as('titles') }).from(posts).where(
		eq(posts.authorId, users.id),
	).as('scalar'),
}).from(users);
export const joinedJsonArrays = await db.select({
	id: users.id,
	titles: sql.jsonArray(posts.title),
}).from(users).leftJoin(posts, eq(posts.authorId, users.id)).groupBy(users.id);

// JSON arrays of joined subqueries are nullable as a whole
const titlesSq = db.select({
	authorId: posts.authorId,
	array: sql.jsonArray(posts.title).as('array'),
}).from(posts).groupBy(posts.authorId).as('titles_sq');
const aggregatedSq = db.select({
	all: sql.jsonArray(titlesSq.array).as('all'),
}).from(users).leftJoin(titlesSq, eq(titlesSq.authorId, users.id)).as('aggregated_sq');

export const joinedJsonArray = await db.select({
	titles: titlesSq.array,
	wrapped: sql.jsonObject({ titles: titlesSq.array }),
}).from(users).leftJoin(titlesSq, eq(titlesSq.authorId, users.id));
export const aggregatedJoinedJsonArray = await db.select({ all: aggregatedSq.all }).from(aggregatedSq);

// Subqueries
const sq = db.select({
	id: users.id,
	bio: users.bio,
	upper: sql<string>`upper(${users.name})`.as('upper'),
	post: { title: posts.title },
	user: users,
	scalar: db.select({ title: posts.title }).from(posts).where(eq(posts.authorId, users.id)).as('scalar'),
	object: sql.jsonObject({ name: users.name, title: posts.title }).as('object'),
}).from(users).leftJoin(posts, eq(posts.authorId, users.id)).as('sq');

export const fromSubquery = await db.select().from(sq);
export const joinedSubquery = await db.select().from(posts).leftJoin(sq, eq(sq.id, posts.authorId));
export const partialFromSubquery = await db.select({
	id: sq.id,
	upper: sq.upper,
	scalar: sq.scalar,
	object: sq.object,
	wrapped: sql.jsonObject({ object: sq.object, scalar: sq.scalar }),
}).from(sq);
const flatSq = db.select({
	id: users.id,
	bio: users.bio,
	upper: sql<string>`upper(${users.name})`.as('upper'),
}).from(users).as('flat_sq');
export const jsonObjectOfSubquery = await db.select({ object: sql.jsonObject(flatSq) }).from(flatSq);

// JSON objects of joined subqueries are nullable as a whole
const authorSq = db.select({
	id: users.id,
	object: sql.jsonObject({ id: users.id, name: users.name }).as('object'),
}).from(users).as('author_sq');
const nestedSq = db.select({
	object: sql.jsonObject({ title: posts.title, author: authorSq.object }).as('object'),
}).from(posts).leftJoin(authorSq, eq(authorSq.id, posts.authorId)).as('nested_sq');
const reselectedSq = db.select({
	id: posts.id,
	author: authorSq.object,
}).from(posts).leftJoin(authorSq, eq(authorSq.id, posts.authorId)).as('reselected_sq');

export const nestedJoinedJsonObject = await db.select({ post: nestedSq.object }).from(nestedSq);
export const reselectedJoinedJsonObject = await db.select().from(reselectedSq);

// Views
const view = pgView('dt_view').as((qb) =>
	qb.select({ id: users.id, bio: users.bio, upper: sql<string>`upper(${users.name})`.as('upper') }).from(users)
);
export const fromView = await db.select().from(view);
export const joinedView = await db.select().from(posts).leftJoin(view, eq(view.id, posts.authorId));
export const jsonObjectOfView = await db.select({ object: sql.jsonObject(view) }).from(view);

// CTEs
const cte = db.$with('cte').as(
	db.select({ id: users.id, upper: sql<string>`upper(${users.name})`.as('upper') }).from(users),
);
export const fromCte = await db.with(cte).select().from(cte);

// Set operators
export const union = await db.select({ id: users.id, name: users.name }).from(users)
	.union(db.select({ id: posts.id, name: posts.title }).from(posts));
