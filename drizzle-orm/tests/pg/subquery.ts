import { Expect } from 'tests/utils';
import { and, eq } from '~/expressions';
import { alias, integer, pgTable, serial, text } from '~/pg-core';
import { sql } from '~/sql';
import type { DrizzleTypeError, Equal } from '~/utils';
import { db } from './db';

const names = pgTable('names', {
	id: serial('id').primaryKey(),
	name: text('name'),
	authorId: integer('author_id'),
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
