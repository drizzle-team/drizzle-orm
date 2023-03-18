import Knex from 'knex';
import { type Equal, Expect } from 'tests/utils';
import { type InferModel, pgTable, serial, text } from '~/pg-core';
import type { PromiseOf } from '~/utils';
import '~/knex';

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
	Expect<Equal<PromiseOf<typeof res>, InferModel<typeof test>[]>>;
}
