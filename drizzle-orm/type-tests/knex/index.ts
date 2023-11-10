import { knex } from 'knex';
import { type Equal, Expect } from 'type-tests/utils.ts';
import { pgTable, serial, text } from '~/pg-core/index.ts';
import type { PromiseOf } from '~/utils.ts';
import '~/knex';

const test = pgTable('test', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

declare module 'knex/types/tables.ts' {
	interface Tables {
		test: Knexify<typeof test>;
	}
}

const db = knex({});

{
	const res = db('test').select();
	Expect<Equal<PromiseOf<typeof res>, typeof test.$inferSelect[]>>;
}
