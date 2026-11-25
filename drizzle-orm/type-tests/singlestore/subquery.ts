import { Expect } from 'type-tests/utils.ts';
import { alias, int, serial, singlestoreTable, text } from '~/singlestore-core/index.ts';
import type { SingleStoreSelect } from '~/singlestore-core/query-builders/select.types.ts';
import { and, eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { DrizzleTypeError, Equal } from '~/utils.ts';
import { db } from './db.ts';

const names = singlestoreTable('names', {
	id: serial('id').primaryKey(),
	name: text('name'),
	authorId: int('author_id'),
});

const n1 = db
	.select({
		id: names.id,
		name: names.name,
		authorId: names.authorId,
		count1: sql<number>`count(1)::int`.as('count1'),
	})
	.from(names)
	.groupBy(names.id, names.name, names.authorId)
	.as('n1');

const n2 = db
	.select({
		id: names.id,
		authorId: names.authorId,
		totalCount: sql<number>`count(1)::int`.as('totalCount'),
	})
	.from(names)
	.groupBy(names.id, names.authorId)
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

const names2 = alias(names, 'names2');

const sq1 = db
	.select({
		id: names.id,
		name: names.name,
		id2: names2.id,
	})
	.from(names)
	.leftJoin(names2, eq(names.name, names2.name))
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
	const sq = db.select({ count: sql<number>`count(1)::int` }).from(names).as('sq');
	Expect<typeof sq.count extends DrizzleTypeError<any> ? true : false>;
}

const sqUnion = db.select().from(names).union(db.select().from(names2)).as('sqUnion');

const resUnion = await db.select().from(sqUnion);

Expect<
	Equal<{
		id: number;
		name: string | null;
		authorId: number | null;
	}[], typeof resUnion>
>;

// https://github.com/drizzle-team/drizzle-orm/issues/4069
{
	const dynamicSq = db.select({ id: names.id }).from(names).$dynamic();

	const fromDynamic = await db.select({ count: sql<number>`count(1)` }).from(dynamicSq.as('dynamic_sq'));
	Expect<Equal<{ count: number }[], typeof fromDynamic>>;

	const joinedDynamic = await db.select({ id: names.id }).from(names).leftJoin(
		dynamicSq.as('dynamic_sq'),
		sql`true`,
	);
	Expect<Equal<{ id: number }[], typeof joinedDynamic>>;

	const countOfGeneric = async <T extends SingleStoreSelect>(qb: T) =>
		db.select({ count: sql<number>`count(1)` }).from(qb.as('generic_sq'));

	const joinGeneric = async <T extends SingleStoreSelect>(qb: T) =>
		db.select({ id: names.id }).from(names).leftJoin(qb.as('generic_sq'), sql`true`);

	const countOfDynamic = await countOfGeneric(dynamicSq);
	Expect<Equal<{ count: number }[], typeof countOfDynamic>>;

	const joinOfDynamic = await joinGeneric(dynamicSq);
	Expect<Equal<{ id: number }[], typeof joinOfDynamic>>;

	const scalarDynamic = await db.select({ id: names.id, sub: dynamicSq.as('scalar_sq') }).from(names);
	Expect<Equal<{ id: number; sub: number | null }[], typeof scalarDynamic>>;

	const scalarGeneric = async <T extends SingleStoreSelect>(qb: T) =>
		db.select({ id: names.id, sub: qb.as('scalar_sq') }).from(names);

	const scalarOfDynamic = await scalarGeneric(dynamicSq);
	Expect<Equal<{ id: number; sub: number | null }[], typeof scalarOfDynamic>>;
}

// JSON object of a joined subquery or view is `null` as a whole when the join has no match, its fields aren't nullable
{
	const authors = singlestoreTable('jo_authors', {
		id: int('id').notNull(),
		name: text('name').notNull(),
	});
	const articles = singlestoreTable('jo_articles', {
		id: int('id').notNull(),
		authorId: int('author_id'),
		title: text('title').notNull(),
	});

	const author = db.select({
		id: authors.id,
		object: sql.jsonObject({ id: authors.id, name: authors.name }).as('object'),
	}).from(authors).as('author');

	// Nested into JSON object of another subquery
	const nested = db.select({
		object: sql.jsonObject({ title: articles.title, author: author.object }).as('object'),
	}).from(articles).leftJoin(author, eq(author.id, articles.authorId)).as('nested');

	const nestedRes = await db.select({ article: nested.object }).from(nested);
	Expect<Equal<typeof nestedRes, { article: { title: string; author: { id: number; name: string } | null } }[]>>;

	// Selected by another subquery
	const reselected = db.select({
		id: articles.id,
		author: author.object,
	}).from(articles).leftJoin(author, eq(author.id, articles.authorId)).as('reselected');

	const reselectedRes = await db.select().from(reselected);
	Expect<Equal<typeof reselectedRes, { id: number; author: { id: number; name: string } | null }[]>>;

	const wrappedRes = await db.select({ wrapped: sql.jsonObject({ author: reselected.author }) }).from(reselected);
	Expect<Equal<typeof wrappedRes, { wrapped: { author: { id: number; name: string } | null } }[]>>;

	// Inner join can't produce `null`
	const inner = db.select({
		object: sql.jsonObject({ title: articles.title, author: author.object }).as('object'),
	}).from(articles).innerJoin(author, eq(author.id, articles.authorId)).as('inner_sq');

	const innerRes = await db.select({ article: inner.object }).from(inner);
	Expect<Equal<typeof innerRes, { article: { title: string; author: { id: number; name: string } } }[]>>;
}
