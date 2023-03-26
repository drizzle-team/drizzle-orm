import Knex from 'knex';
import { type Equal, Expect } from 'tests/utils';
import { pgTable, serial, text } from '~/pg-core';
import type { PromiseOf } from '~/utils';
import '~/knex';
import type { InferModel } from '~/table';

const test = pgTable('test', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

declare module 'knex/types/tables' {
	interface Tables {
		test: Knexify<typeof test>;
	}
}

const db = Knex({});

{
	const res = db('test').select();
	Expect<Equal<PromiseOf<typeof res>, typeof test['_']['model']['select'][]>>;
}

{
	// before
	type Test = InferModel<typeof test>;
}

{
	// after
	type Test = typeof test['_']['model']['select'];
}
