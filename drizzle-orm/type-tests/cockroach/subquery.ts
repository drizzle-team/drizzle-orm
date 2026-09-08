import { Expect } from 'type-tests/utils.ts';
import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/index.ts';
import { alias, cockroachTable, int4, text } from '~/cockroach-core/index.ts';
import type { CockroachSelect } from '~/cockroach-core/query-builders/select.types.ts';
import { and, eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { DrizzleTypeError, Equal } from '~/utils.ts';
import { db } from './db.ts';

const names = cockroachTable('names', {
	id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name'),
	authorId: int4('author_id'),
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

	const countOfGeneric = async <T extends CockroachSelect>(qb: T) =>
		db.select({ count: sql<number>`count(1)` }).from(qb.as('generic_sq'));

	const joinGeneric = async <T extends CockroachSelect>(qb: T) =>
		db.select({ id: names.id }).from(names).leftJoin(qb.as('generic_sq'), sql`true`);

	const countOfDynamic = await countOfGeneric(dynamicSq);
	Expect<Equal<{ count: number }[], typeof countOfDynamic>>;

	const joinOfDynamic = await joinGeneric(dynamicSq);
	Expect<Equal<{ id: number }[], typeof joinOfDynamic>>;

	const scalarDynamic = await db.select({ id: names.id, sub: dynamicSq.as('scalar_sq') }).from(names);
	Expect<Equal<{ id: number; sub: number }[], typeof scalarDynamic>>;

	const scalarGeneric = async <T extends CockroachSelect>(qb: T) =>
		db.select({ id: names.id, sub: qb.as('scalar_sq') }).from(names);

	const scalarOfDynamic = await scalarGeneric(dynamicSq);
	Expect<Equal<{ id: number; sub: number }[], typeof scalarOfDynamic>>;
}

// https://github.com/drizzle-team/drizzle-orm/issues/4069 - cases from comments
{
	const selectFromGeneric = async <T extends CockroachTable>(table: T) => db.select().from(table);

	const selectFromAnyCockroach = async <T extends AnyCockroachTable>(table: T) => db.select().from(table);

	type NamedTables = typeof names | typeof names2;
	const selectFromUnion = async <T extends NamedTables>(table: T) => db.select({ id: table.id }).from(table);

	const joinGenericTable = async <T extends CockroachTable>(table: T) =>
		db.select({ id: names.id }).from(names).leftJoin(table, sql`true`);

	const crossJoinGenericTable = async <T extends CockroachTable>(table: T) =>
		db.select({ id: names.id }).from(names).crossJoin(table);

	const updateFromGenericTable = async <T extends CockroachTable>(table: T) =>
		db.update(names).set({ name: 'x' }).from(table).returning({ id: names.id });

	const updateJoinGenericTable = async <T extends CockroachTable>(table: T) =>
		db.update(names).set({ name: 'x' }).from(names).leftJoin(table, sql`true`).returning({ id: names.id });

	const fromGeneric = await selectFromGeneric(names);
	Expect<Equal<{ id: number; name: string | null; authorId: number | null }[], typeof fromGeneric>>;

	const fromAnyCockroach = await selectFromAnyCockroach(names);
	Expect<Equal<{ id: number; name: string | null; authorId: number | null }[], typeof fromAnyCockroach>>;

	const fromUnion = await selectFromUnion(names);
	Expect<Equal<{ id: number }[], typeof fromUnion>>;

	const joinedGeneric = await joinGenericTable(names2);
	Expect<Equal<{ id: number }[], typeof joinedGeneric>>;

	const crossJoinedGeneric = await crossJoinGenericTable(names2);
	Expect<Equal<{ id: number }[], typeof crossJoinedGeneric>>;

	const updatedFromGeneric = await updateFromGenericTable(names2);
	Expect<Equal<{ id: number }[], typeof updatedFromGeneric>>;

	const updatedJoinGeneric = await updateJoinGenericTable(names2);
	Expect<Equal<{ id: number }[], typeof updatedJoinGeneric>>;
}

{
	const emptySq = db.select({}).from(names).as('empty_sq');
	Expect<Equal<{}, (typeof emptySq)['_']['selectedFields']>>;

	// @ts-expect-error
	db.select().from(emptySq);
	// @ts-expect-error
	db.select().from(names).leftJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(names).rightJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(names).innerJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(names).fullJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(names).crossJoin(emptySq);
	// @ts-expect-error
	db.select().from(names).leftJoinLateral(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(names).innerJoinLateral(emptySq, sql`true`);
	// @ts-expect-error
	db.select().from(names).crossJoinLateral(emptySq);
	// @ts-expect-error
	db.update(names).set({ name: 'x' }).from(emptySq);
	// @ts-expect-error
	db.update(names).set({ name: 'x' }).from(names).leftJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.update(names).set({ name: 'x' }).from(names).rightJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.update(names).set({ name: 'x' }).from(names).innerJoin(emptySq, sql`true`);
	// @ts-expect-error
	db.update(names).set({ name: 'x' }).from(names).fullJoin(emptySq, sql`true`);

	const fullSq = db.select({ id: names.id }).from(names).as('full_sq');
	db.select().from(fullSq);
	db.select().from(names).leftJoin(fullSq, sql`true`);
	db.select().from(names).crossJoinLateral(fullSq);
	db.update(names).set({ name: 'x' }).from(fullSq);
}
