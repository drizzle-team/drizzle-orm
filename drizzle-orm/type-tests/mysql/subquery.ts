import { Expect } from 'type-tests/utils.ts';
import { alias, int, mysqlTable, serial, text } from '~/mysql-core/index.ts';
import { and, eq } from '~/sql/expressions/index.ts';
import { count } from '~/sql/functions/aggregate.ts';
import { sql } from '~/sql/sql.ts';
import type { DrizzleTypeError, Equal } from '~/utils.ts';
import { db } from './db.ts';

const users = mysqlTable('names', {
	id: serial('id').primaryKey(),
	name: text('name'),
	managerId: int('author_id'),
});

const posts = mysqlTable('posts', {
	id: serial('id').primaryKey(),
	authorId: int('author_id'),
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
