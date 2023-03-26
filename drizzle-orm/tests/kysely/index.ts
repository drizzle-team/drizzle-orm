import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { type Equal, Expect } from 'tests/utils';
import type { Kyselify } from '~/kysely';
import { pgTable, serial, text } from '~/pg-core';
import type { InferModel } from '~/table';
import type { PromiseOf } from '~/utils';

const test = pgTable('test', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

interface Database {
	test: Kyselify<typeof test>;
}

const db = new Kysely<Database>({
	dialect: new PostgresDialect({
		pool: new Pool(),
	}),
});

const result = db.selectFrom('test').selectAll().execute();
Expect<Equal<PromiseOf<typeof result>, InferModel<typeof test>[]>>();
