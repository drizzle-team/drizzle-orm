import { Expect } from 'type-tests/utils.ts';
import type { AnyPgTable, PgTable } from '~/pg-core/index.ts';
import { alias, integer, pgTable, serial, text } from '~/pg-core/index.ts';
import type { PgSelect } from '~/pg-core/query-builders/select.ts';
import { and, eq } from '~/sql/expressions/index.ts';
import { count } from '~/sql/functions/aggregate.ts';
import { sql } from '~/sql/sql.ts';
import type { DrizzleTypeError, Equal } from '~/utils.ts';
import { db } from './db.ts';

const users = pgTable('names', {
	id: serial('id').primaryKey(),
	name: text('name'),
	managerId: integer('author_id'),
});

const posts = pgTable('posts', {
	id: serial('id').primaryKey(),
	authorId: integer('author_id'),
	title: text('title'),
});

const n1 = db
	.select({
		id: users.id,
		name: users.name,
		authorId: users.managerId,
		count1: sql<number>`count(1)::int`.as('count1'),
	})
	.from(users)
	.groupBy(users.id, users.name, users.managerId)
	.as('n1');

const n2 = db
	.select({
		id: users.id,
		authorId: users.managerId,
		totalCount: sql<number>`count(1)::int`.as('totalCount'),
	})
	.from(users)
	.groupBy(users.id, users.managerId)
	.as('n2');

const result = await db
	.select({
		name: n1.name,
		authorId: n1.authorId,
		count1: n1.count1,
		totalCount: n2.totalCount,
	})
	.from(n1)
	.innerJoin(n2, and(eq(n2.id, n1.id), eq(n2.authorId, n1.authorId)));

Expect<
	Equal<
		{
			name: string | null;
			authorId: number | null;
			count1: number;
			totalCount: number;
		}[],
		typeof result
	>
>;

const names2 = alias(users, 'names2');

const sq1 = db
	.select({
		id: users.id,
		name: users.name,
		id2: names2.id,
	})
	.from(users)
	.leftJoin(names2, eq(users.name, names2.name))
	.as('sq1');

const res = await db.select().from(sq1);

Expect<
	Equal<
		{
			id: number;
			name: string | null;
			id2: number | null;
		}[],
		typeof res
	>
>;

{
	const sq = db.select({ count: sql<number>`count(1)::int` }).from(users).as('sq');
	Expect<typeof sq.count extends DrizzleTypeError<any> ? true : false>;
}

const sqUnion = db.select().from(users).union(db.select().from(names2)).as('sqUnion');

const resUnion = await db.select().from(sqUnion);

Expect<
	Equal<{
		id: number;
		name: string | null;
		managerId: number | null;
	}[], typeof resUnion>
>;

const fromSubquery = await db.select({
	count: db.select({ count: count().as('c') }).from(posts).where(eq(posts.authorId, users.id)).as('count'),
}).from(users);

Expect<Equal<typeof fromSubquery, { count: number }[]>>;

const fromSubquery2 = await db.select({
	name: db.select({ name: users.name }).from(users).where(eq(users.id, posts.authorId)).as('name'),
}).from(posts);

Expect<Equal<typeof fromSubquery2, { name: string | null }[]>>;

const errorSubquery = await db.select({
	name: db.select({ name: users.name, managerId: users.managerId }).from(users).where(eq(users.id, posts.authorId)).as(
		'name',
	),
}).from(posts);

Expect<Equal<typeof errorSubquery, { name: DrizzleTypeError<'You can only select one column in the subquery'> }[]>>;

// https://github.com/drizzle-team/drizzle-orm/issues/4069
{
	const dynamicSq = db.select({ id: users.id }).from(users).$dynamic();

	const fromDynamic = await db.select({ count: sql<number>`count(1)` }).from(dynamicSq.as('dynamic_sq'));
	Expect<Equal<{ count: number }[], typeof fromDynamic>>;

	const joinedDynamic = await db.select({ id: users.id }).from(users).leftJoin(
		dynamicSq.as('dynamic_sq'),
		sql`true`,
	);
	Expect<Equal<{ id: number }[], typeof joinedDynamic>>;

	const countOfGeneric = async <T extends PgSelect<string | undefined, Record<string, any>>>(qb: T) =>
		db.select({ count: sql<number>`count(1)` }).from(qb.as('generic_sq'));

	const joinGeneric = async <T extends PgSelect>(qb: T) =>
		db.select({ id: users.id }).from(users).leftJoin(qb.as('generic_sq'), sql`true`);

	const countOfDynamic = await countOfGeneric(dynamicSq);
	Expect<Equal<{ count: number }[], typeof countOfDynamic>>;

	const joinOfDynamic = await joinGeneric(dynamicSq);
	Expect<Equal<{ id: number }[], typeof joinOfDynamic>>;

	const scalarDynamic = await db.select({ id: users.id, sub: dynamicSq.as('scalar_sq') }).from(users);
	Expect<Equal<{ id: number; sub: number }[], typeof scalarDynamic>>;

	const scalarGeneric = async <T extends PgSelect>(qb: T) =>
		db.select({ id: users.id, sub: qb.as('scalar_sq') }).from(users);

	const scalarOfDynamic = await scalarGeneric(dynamicSq);
	Expect<Equal<{ id: number; sub: number }[], typeof scalarOfDynamic>>;
}

// https://github.com/drizzle-team/drizzle-orm/issues/4069 - cases from comments
{
	const selectFromGeneric = async <T extends PgTable>(table: T) => db.select().from(table);

	const selectFromAnyPg = async <T extends AnyPgTable>(table: T) => db.select().from(table);

	type NamedTables = typeof users | typeof posts;
	const selectFromUnion = async <T extends NamedTables>(table: T) => db.select({ id: table.id }).from(table);

	const joinGenericTable = async <T extends PgTable>(table: T) =>
		db.select({ id: users.id }).from(users).leftJoin(table, sql`true`);

	const crossJoinGenericTable = async <T extends PgTable>(table: T) =>
		db.select({ id: users.id }).from(users).crossJoin(table);

	const updateFromGenericTable = async <T extends PgTable>(table: T) =>
		db.update(users).set({ name: 'x' }).from(table).returning({ id: users.id });

	const updateJoinGenericTable = async <T extends PgTable>(table: T) =>
		db.update(users).set({ name: 'x' }).from(users).leftJoin(table, sql`true`).returning({ id: users.id });

	const fromGeneric = await selectFromGeneric(users);
	Expect<Equal<{ id: number; name: string | null; managerId: number | null }[], typeof fromGeneric>>;

	const fromAnyPg = await selectFromAnyPg(users);
	Expect<Equal<{ id: number; name: string | null; managerId: number | null }[], typeof fromAnyPg>>;

	const fromUnion = await selectFromUnion(users);
	Expect<Equal<{ id: number }[], typeof fromUnion>>;

	const joinedGeneric = await joinGenericTable(posts);
	Expect<Equal<{ id: number }[], typeof joinedGeneric>>;

	const crossJoinedGeneric = await crossJoinGenericTable(posts);
	Expect<Equal<{ id: number }[], typeof crossJoinedGeneric>>;

	const updatedFromGeneric = await updateFromGenericTable(posts);
	Expect<Equal<{ id: number }[], typeof updatedFromGeneric>>;

	const updatedJoinGeneric = await updateJoinGenericTable(posts);
	Expect<Equal<{ id: number }[], typeof updatedJoinGeneric>>;
}

{
	const emptySq = db.select({}).from(users).as('empty_sq');
	Expect<Equal<{}, (typeof emptySq)['_']['selectedFields']>>;

	// @ts-expect-error
	db.select().from(emptySq);
	// @ts-expect-error
	db.select().from(users).leftJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(users).rightJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(users).innerJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(users).fullJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(users).crossJoin(emptySq);
	// @ts-expect-error
	db.select().from(users).leftJoinLateral(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(users).innerJoinLateral(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(users).crossJoinLateral(emptySq);
	// @ts-expect-error
	db.update(users).set({ name: 'x' }).from(emptySq);
	// @ts-expect-error
	db.update(users).set({ name: 'x' }).from(users).leftJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.update(users).set({ name: 'x' }).from(users).rightJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.update(users).set({ name: 'x' }).from(users).innerJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.update(users).set({ name: 'x' }).from(users).fullJoin(emptySq, sql`true`);

	const fullSq = db.select({ id: users.id }).from(users).as('full_sq');
	db.select().from(fullSq);
	db.select().from(users).leftJoin(fullSq, sql`true`);
	db.select().from(users).crossJoinLateral(fullSq);
	db.update(users).set({ name: 'x' }).from(fullSq);
}
