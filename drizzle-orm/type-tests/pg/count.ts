import { Expect } from 'type-tests/utils.ts';
import { integer, pgTable, serial, text } from '~/pg-core/index.ts';
import { and, gt, ne } from '~/sql/expressions/index.ts';
import type { Equal } from '~/utils.ts';
import { db } from './db.ts';

const names = pgTable('names', {
	id: serial('id').primaryKey(),
	name: text('name'),
	authorId: integer('author_id'),
});

const separate = await db.$count(names);

const separateFilters = await db.$count(names, and(gt(names.id, 1), ne(names.name, 'forbidden')));

const embedded = await db
	.select({
		id: names.id,
		name: names.name,
		authorId: names.authorId,
		count1: db.$count(names).as('count1'),
	})
	.from(names);

const embeddedFilters = await db
	.select({
		id: names.id,
		name: names.name,
		authorId: names.authorId,
		count1: db.$count(names, and(gt(names.id, 1), ne(names.name, 'forbidden'))).as('count1'),
	})
	.from(names);

Expect<Equal<number, typeof separate>>;

Expect<Equal<number, typeof separateFilters>>;

Expect<
	Equal<
		{
			id: number;
			name: string | null;
			authorId: number | null;
			count1: number;
		}[],
		typeof embedded
	>
>;

Expect<
	Equal<
		{
			id: number;
			name: string | null;
			authorId: number | null;
			count1: number;
		}[],
		typeof embeddedFilters
	>
>;
