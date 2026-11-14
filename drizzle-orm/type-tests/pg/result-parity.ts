// Result types of the async and the Effect Postgres databases, side by side: every case builds the same query on both
// and checks both against one expected row type. A change to how either API infers results fails here. Effect cases
// also pin the error and requirement types, which the async API doesn't have.
import type * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import pg from 'pg';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectPgDatabase } from '~/effect-postgres/index.ts';
import { drizzle } from '~/node-postgres/index.ts';
import { withReplicas } from '~/pg-core/async/db.ts';
import { withReplicas as withEffectReplicas } from '~/pg-core/effect/db.ts';
import { integer, jsonb, pgTable, text } from '~/pg-core/index.ts';
import { defineRelations } from '~/relations.ts';
import { eq, gt } from '~/sql/expressions/index.ts';
import { count } from '~/sql/functions/aggregate.ts';
import { sql } from '~/sql/sql.ts';

const users = pgTable('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
	email: text(),
	cityId: integer(),
});
const posts = pgTable('posts', {
	id: integer().primaryKey(),
	authorId: integer().notNull(),
	title: text(),
	meta: jsonb().$type<{ k: string }>(),
});
const tags = pgTable('tags', { id: integer().primaryKey(), label: text() });
const relations = defineRelations({ users, posts, tags }, (r) => ({
	users: { posts: r.many.posts() },
	posts: { author: r.one.users({ from: r.posts.authorId, to: r.users.id }) },
}));

type User = { id: number; name: string; email: string | null; cityId: number | null };
type Post = { id: number; authorId: number; title: string | null; meta: { k: string } | null };
type Tag = { id: number; label: string | null };

const db = drizzle({ client: new pg.Client(), relations });
declare const edb: EffectPgDatabase<typeof relations>;

/** What running the query gives: the awaited value for async, the success value for Effect. */
type Rows<Q> = Q extends Effect.Effect<infer A, any, any> ? A : Awaited<Q>;
/** An Effect query's error and requirement channels. */
type Channels<Q> = Q extends Effect.Effect<any, infer E, infer R> ? [E, R] : never;
type QueryChannels = [EffectDrizzleQueryError, never];

// ---- select ----

{
	const a = db.select().from(users);
	const e = edb.select().from(users);
	Expect<Equal<Rows<typeof a>, User[]>>;
	Expect<Equal<Rows<typeof e>, User[]>>;
	Expect<Equal<Channels<typeof e>, QueryChannels>>;
}

{
	// Nested objects and sql<T> fields in the selection
	const a = db.select({
		id: users.id,
		profile: { name: users.name, email: users.email },
		posts: sql<number>`count(*)`,
	}).from(users);
	const e = edb.select({
		id: users.id,
		profile: { name: users.name, email: users.email },
		posts: sql<number>`count(*)`,
	}).from(users);
	type Expected = { id: number; profile: { name: string; email: string | null }; posts: number }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
}

{
	// Join nullability, all columns: left and inner
	const a = db.select().from(users).leftJoin(posts, eq(posts.authorId, users.id)).innerJoin(
		tags,
		eq(tags.id, posts.id),
	);
	const e = edb.select().from(users).leftJoin(posts, eq(posts.authorId, users.id)).innerJoin(
		tags,
		eq(tags.id, posts.id),
	);
	type Expected = { users: User; posts: Post | null; tags: Tag }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
}

{
	// right join: the left side becomes nullable
	const a = db.select().from(users).rightJoin(posts, eq(posts.authorId, users.id));
	const e = edb.select().from(users).rightJoin(posts, eq(posts.authorId, users.id));
	type Expected = { users: User | null; posts: Post }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
}

{
	// full join: both sides nullable
	const a = db.select().from(users).fullJoin(posts, eq(posts.authorId, users.id));
	const e = edb.select().from(users).fullJoin(posts, eq(posts.authorId, users.id));
	type Expected = { users: User | null; posts: Post | null }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
}

{
	// cross join: neither side nullable
	const a = db.select().from(users).crossJoin(tags);
	const e = edb.select().from(users).crossJoin(tags);
	type Expected = { users: User; tags: Tag }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
}

{
	// Chosen fields across a left join: the joined table's fields and objects become nullable
	const a = db.select({ name: users.name, post: { id: posts.id, title: posts.title } }).from(users).leftJoin(
		posts,
		eq(posts.authorId, users.id),
	);
	const e = edb.select({ name: users.name, post: { id: posts.id, title: posts.title } }).from(users).leftJoin(
		posts,
		eq(posts.authorId, users.id),
	);
	type Expected = { name: string; post: { id: number; title: string | null } | null }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
}

{
	// Lateral joins with a correlated subquery
	const asq = db.select({ title: posts.title, id: posts.id }).from(posts).where(eq(posts.authorId, users.id)).as('sq');
	const esq = edb.select({ title: posts.title, id: posts.id }).from(posts).where(eq(posts.authorId, users.id)).as(
		'sq',
	);
	const a = db.select({ name: users.name, postId: asq.id }).from(users).leftJoinLateral(asq, sql`true`);
	const e = edb.select({ name: users.name, postId: esq.id }).from(users).leftJoinLateral(esq, sql`true`);
	type Expected = { name: string; postId: number | null }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;

	const ai = db.select({ name: users.name, postId: asq.id }).from(users).innerJoinLateral(asq, sql`true`);
	const ei = edb.select({ name: users.name, postId: esq.id }).from(users).innerJoinLateral(esq, sql`true`);
	type ExpectedInner = { name: string; postId: number }[];
	Expect<Equal<Rows<typeof ai>, ExpectedInner>>;
	Expect<Equal<Rows<typeof ei>, ExpectedInner>>;

	const ac = db.select({ name: users.name, postId: asq.id }).from(users).crossJoinLateral(asq);
	const ec = edb.select({ name: users.name, postId: esq.id }).from(users).crossJoinLateral(esq);
	Expect<Equal<Rows<typeof ac>, ExpectedInner>>;
	Expect<Equal<Rows<typeof ec>, ExpectedInner>>;
}

{
	// A long chain keeps the result: every step goes back through the builder's HKT
	const a = db.select({ id: users.id, n: count() }).from(users).leftJoin(posts, eq(posts.authorId, users.id))
		.where(gt(users.id, 0)).groupBy(users.id).having(gt(count(), 1)).orderBy(users.id).limit(10).offset(5);
	const e = edb.select({ id: users.id, n: count() }).from(users).leftJoin(posts, eq(posts.authorId, users.id))
		.where(gt(users.id, 0)).groupBy(users.id).having(gt(count(), 1)).orderBy(users.id).limit(10).offset(5);
	type Expected = { id: number; n: number }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
	Expect<Equal<Channels<typeof e>, QueryChannels>>;

	const af = db.select().from(users).where(eq(users.id, 1)).for('update', { skipLocked: true });
	const ef = edb.select().from(users).where(eq(users.id, 1)).for('update', { skipLocked: true });
	Expect<Equal<Rows<typeof af>, User[]>>;
	Expect<Equal<Rows<typeof ef>, User[]>>;
}

{
	// $dynamic: methods can be called again and in any order, the result stays
	const a = db.select({ id: users.id }).from(users).$dynamic().where(eq(users.id, 1)).limit(1).where(gt(users.id, 0));
	const e = edb.select({ id: users.id }).from(users).$dynamic().where(eq(users.id, 1)).limit(1).where(
		gt(users.id, 0),
	);
	Expect<Equal<Rows<typeof a>, { id: number }[]>>;
	Expect<Equal<Rows<typeof e>, { id: number }[]>>;
}

{
	// selectDistinct and selectDistinctOn
	const a = db.selectDistinct({ name: users.name }).from(users);
	const e = edb.selectDistinct({ name: users.name }).from(users);
	Expect<Equal<Rows<typeof a>, { name: string }[]>>;
	Expect<Equal<Rows<typeof e>, { name: string }[]>>;

	const ao = db.selectDistinctOn([users.cityId], { id: users.id, cityId: users.cityId }).from(users);
	const eo = edb.selectDistinctOn([users.cityId], { id: users.id, cityId: users.cityId }).from(users);
	Expect<Equal<Rows<typeof ao>, { id: number; cityId: number | null }[]>>;
	Expect<Equal<Rows<typeof eo>, { id: number; cityId: number | null }[]>>;

	const aa = db.selectDistinct().from(users);
	const ea = edb.selectDistinct().from(users);
	Expect<Equal<Rows<typeof aa>, User[]>>;
	Expect<Equal<Rows<typeof ea>, User[]>>;
}

{
	// A subquery in from, with an aliased sql field
	const asq = db.select({ id: users.id, upper: sql<string>`upper(${users.name})`.as('upper') }).from(users).as('sq');
	const esq = edb.select({ id: users.id, upper: sql<string>`upper(${users.name})`.as('upper') }).from(users).as(
		'sq',
	);
	const a = db.select().from(asq);
	const e = edb.select().from(esq);
	Expect<Equal<Rows<typeof a>, { id: number; upper: string }[]>>;
	Expect<Equal<Rows<typeof e>, { id: number; upper: string }[]>>;
}

{
	// CTEs: $with, then with(...).select, and a CTE joined to a table
	const an = db.$with('named').as(db.select({ id: users.id, name: users.name }).from(users));
	const en = edb.$with('named').as(edb.select({ id: users.id, name: users.name }).from(users));
	const a = db.with(an).select().from(an);
	const e = edb.with(en).select().from(en);
	Expect<Equal<Rows<typeof a>, { id: number; name: string }[]>>;
	Expect<Equal<Rows<typeof e>, { id: number; name: string }[]>>;

	const aj = db.with(an).select({ name: an.name, title: posts.title }).from(an).leftJoin(
		posts,
		eq(posts.authorId, an.id),
	);
	const ej = edb.with(en).select({ name: en.name, title: posts.title }).from(en).leftJoin(
		posts,
		eq(posts.authorId, en.id),
	);
	Expect<Equal<Rows<typeof aj>, { name: string; title: string | null }[]>>;
	Expect<Equal<Rows<typeof ej>, { name: string; title: string | null }[]>>;
}

{
	// Set operators, as methods
	const a = db.select({ id: users.id }).from(users);
	const b = db.select({ id: posts.id }).from(posts);
	const e = edb.select({ id: users.id }).from(users);
	const f = edb.select({ id: posts.id }).from(posts);
	type Expected = { id: number }[];
	const au = a.union(b);
	const eu = e.union(f);
	Expect<Equal<Rows<typeof au>, Expected>>;
	Expect<Equal<Rows<typeof eu>, Expected>>;
	const aua = a.unionAll(b);
	const eua = e.unionAll(f);
	Expect<Equal<Rows<typeof aua>, Expected>>;
	Expect<Equal<Rows<typeof eua>, Expected>>;
	const ai = a.intersect(b);
	const ei = e.intersect(f);
	Expect<Equal<Rows<typeof ai>, Expected>>;
	Expect<Equal<Rows<typeof ei>, Expected>>;
	const aia = a.intersectAll(b);
	const eia = e.intersectAll(f);
	Expect<Equal<Rows<typeof aia>, Expected>>;
	Expect<Equal<Rows<typeof eia>, Expected>>;
	const ax = a.except(b);
	const ex = e.except(f);
	Expect<Equal<Rows<typeof ax>, Expected>>;
	Expect<Equal<Rows<typeof ex>, Expected>>;
	const axa = a.exceptAll(b).orderBy(users.id).limit(5);
	const exa = e.exceptAll(f).orderBy(users.id).limit(5);
	Expect<Equal<Rows<typeof axa>, Expected>>;
	Expect<Equal<Rows<typeof exa>, Expected>>;
}

// ---- insert, update, delete ----

{
	const a = db.insert(users).values({ id: 1, name: 'a' }).returning({ id: users.id });
	const e = edb.insert(users).values({ id: 1, name: 'a' }).returning({ id: users.id });
	Expect<Equal<Rows<typeof a>, { id: number }[]>>;
	Expect<Equal<Rows<typeof e>, { id: number }[]>>;
	Expect<Equal<Channels<typeof e>, QueryChannels>>;
}

{
	// insert ... select
	const a = db.insert(tags).select(db.select({ id: users.id, label: users.name }).from(users)).returning();
	const e = edb.insert(tags).select(edb.select({ id: users.id, label: users.name }).from(users)).returning();
	Expect<Equal<Rows<typeof a>, Tag[]>>;
	Expect<Equal<Rows<typeof e>, Tag[]>>;
}

{
	// on conflict, then returning
	const a = db.insert(users).values({ id: 1, name: 'a' }).onConflictDoNothing().returning();
	const e = edb.insert(users).values({ id: 1, name: 'a' }).onConflictDoNothing().returning();
	Expect<Equal<Rows<typeof a>, User[]>>;
	Expect<Equal<Rows<typeof e>, User[]>>;

	const au = db.insert(users).values({ id: 1, name: 'a' }).onConflictDoUpdate({ target: users.id, set: { name: 'b' } })
		.returning({ name: users.name });
	const eu = edb.insert(users).values({ id: 1, name: 'a' }).onConflictDoUpdate({
		target: users.id,
		set: { name: 'b' },
	}).returning({ name: users.name });
	Expect<Equal<Rows<typeof au>, { name: string }[]>>;
	Expect<Equal<Rows<typeof eu>, { name: string }[]>>;
}

{
	// update ... from ... join: returning fields of a left-joined table become nullable
	const a = db.update(users).set({ name: 'b' }).from(posts).leftJoin(tags, eq(tags.id, posts.id)).where(
		eq(posts.authorId, users.id),
	).returning({ id: users.id, postId: posts.id, tagId: tags.id });
	const e = edb.update(users).set({ name: 'b' }).from(posts).leftJoin(tags, eq(tags.id, posts.id)).where(
		eq(posts.authorId, users.id),
	).returning({ id: users.id, postId: posts.id, tagId: tags.id });
	type Expected = { id: number; postId: number; tagId: number | null }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
	Expect<Equal<Channels<typeof e>, QueryChannels>>;
}

{
	const a = db.delete(users).where(eq(users.id, 1)).returning({ id: users.id });
	const e = edb.delete(users).where(eq(users.id, 1)).returning({ id: users.id });
	Expect<Equal<Rows<typeof a>, { id: number }[]>>;
	Expect<Equal<Rows<typeof e>, { id: number }[]>>;
}

// ---- relational queries ----

{
	const a = db.query.users.findMany({
		columns: { id: true, name: true },
		with: { posts: { columns: { title: true } } },
	});
	const e = edb.query.users.findMany({
		columns: { id: true, name: true },
		with: { posts: { columns: { title: true } } },
	});
	type Expected = { id: number; name: string; posts: { title: string | null }[] }[];
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
	Expect<Equal<Channels<typeof e>, QueryChannels>>;
}

{
	const a = db.query.posts.findFirst({ columns: { id: true }, with: { author: { columns: { name: true } } } });
	const e = edb.query.posts.findFirst({ columns: { id: true }, with: { author: { columns: { name: true } } } });
	type Expected = { id: number; author: { name: string } | null } | undefined;
	Expect<Equal<Rows<typeof a>, Expected>>;
	Expect<Equal<Rows<typeof e>, Expected>>;
}

{
	const a = db.query.users.findMany({
		columns: { id: true },
		extras: { upper: (t) => sql<string>`upper(${t.name})` },
		where: { id: { gt: 0 } },
		orderBy: { id: 'desc' },
		limit: 10,
	});
	const e = edb.query.users.findMany({
		columns: { id: true },
		extras: { upper: (t) => sql<string>`upper(${t.name})` },
		where: { id: { gt: 0 } },
		orderBy: { id: 'desc' },
		limit: 10,
	});
	Expect<Equal<Rows<typeof a>, { id: number; upper: string }[]>>;
	Expect<Equal<Rows<typeof e>, { id: number; upper: string }[]>>;
}

// ---- prepared statements, transactions, replicas ----

{
	const a = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('a').execute({ id: 1 });
	const e = edb.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('e').execute({ id: 1 });
	Expect<Equal<Rows<typeof a>, User[]>>;
	Expect<Equal<Rows<typeof e>, User[]>>;
	Expect<Equal<Channels<typeof e>, QueryChannels>>;
}

{
	// A nested transaction returns what its body returns
	const a = db.transaction((tx) => tx.transaction((nested) => nested.select({ id: users.id }).from(users)));
	const e = edb.transaction((tx) => tx.transaction((nested) => nested.select({ id: users.id }).from(users)));
	Expect<Equal<Rows<typeof a>, { id: number }[]>>;
	Expect<Equal<Rows<typeof e>, { id: number }[]>>;
	Expect<Equal<Channels<typeof e>, [EffectDrizzleQueryError | SqlError, never]>>;
}

{
	// Replicas: queries run on the primary by default, and `$replica` is a database of the same type
	const ar = withReplicas(db, [db]);
	const er = withEffectReplicas(edb, [edb]);
	const a = ar.select().from(users);
	const e = er.select().from(users);
	Expect<Equal<Rows<typeof a>, User[]>>;
	Expect<Equal<Rows<typeof e>, User[]>>;
	const ar2 = ar.$replica.select({ id: users.id }).from(users);
	const er2 = er.$replica.select({ id: users.id }).from(users);
	Expect<Equal<Rows<typeof ar2>, { id: number }[]>>;
	Expect<Equal<Rows<typeof er2>, { id: number }[]>>;
}
