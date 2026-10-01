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
	Expect<Equal<{ id: number; sub: number }[], typeof scalarDynamic>>;

	const scalarGeneric = async <T extends SingleStoreSelect>(qb: T) =>
		db.select({ id: names.id, sub: qb.as('scalar_sq') }).from(names);

	const scalarOfDynamic = await scalarGeneric(dynamicSq);
	Expect<Equal<{ id: number; sub: number }[], typeof scalarOfDynamic>>;
}
