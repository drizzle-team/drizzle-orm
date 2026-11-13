import { Expect } from 'type-tests/utils.ts';
import { and, eq } from '~/sql/expressions/index.ts';
import { count } from '~/sql/functions/aggregate.ts';
import { sql } from '~/sql/sql.ts';
import { alias, integer, sqliteTable, text } from '~/sqlite-core/index.ts';
import type { SQLiteSelect } from '~/sqlite-core/query-builders/select.types.ts';
import type { DrizzleTypeError, Equal } from '~/utils.ts';
import { db } from './db.ts';

const users = sqliteTable('names', {
	id: integer('id').primaryKey(),
	name: text('name'),
	managerId: integer('author_id'),
});

const posts = sqliteTable('posts', {
	id: integer('id').primaryKey(),
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

const result = db
	.select({
		name: n1.name,
		authorId: n1.authorId,
		count1: n1.count1,
		totalCount: n2.totalCount,
	})
	.from(n1)
	.innerJoin(n2, and(eq(n2.id, n1.id), eq(n2.authorId, n1.authorId)))
	.all();

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

const res = db.select().from(sq1).all();

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

	const countOfGeneric = async <T extends SQLiteSelect>(qb: T) =>
		db.select({ count: sql<number>`count(1)` }).from(qb.as('generic_sq'));

	const joinGeneric = async <T extends SQLiteSelect>(qb: T) =>
		db.select({ id: users.id }).from(users).leftJoin(qb.as('generic_sq'), sql`true`);

	const countOfDynamic = await countOfGeneric(dynamicSq);
	Expect<Equal<{ count: number }[], typeof countOfDynamic>>;

	const joinOfDynamic = await joinGeneric(dynamicSq);
	Expect<Equal<{ id: number }[], typeof joinOfDynamic>>;

	const scalarDynamic = await db.select({ id: users.id, sub: dynamicSq.as('scalar_sq') }).from(users);
	Expect<Equal<{ id: number; sub: number }[], typeof scalarDynamic>>;

	const scalarGeneric = async <T extends SQLiteSelect>(qb: T) =>
		db.select({ id: users.id, sub: qb.as('scalar_sq') }).from(users);

	const scalarOfDynamic = await scalarGeneric(dynamicSq);
	Expect<Equal<{ id: number; sub: number }[], typeof scalarOfDynamic>>;
}
