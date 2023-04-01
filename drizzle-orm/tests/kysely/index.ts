import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { type Equal, Expect } from 'tests/utils';
import type { Kyselify } from '~/kysely';
import { char, mysqlTable, timestamp, varchar } from '~/mysql-core';
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

{
	const units = mysqlTable('units', {
		id: char('id', { length: 16 }).primaryKey(),
		name: varchar('name', { length: 255 }).notNull(),
		abbreviation: varchar('abbreviation', { length: 10 }).notNull(),
		created_at: timestamp('created_at').defaultNow().notNull(),
		updated_at: timestamp('updated_at').defaultNow().notNull().onUpdateNow(),
	});

	type UnitModel = typeof units;

	interface Database {
		units: Kyselify<UnitModel>;
	}

	const db = new Kysely<Database>({
		dialect: new PostgresDialect({
			pool: new Pool(),
		}),
	});

	await db
		.insertInto('units')
		.values({
			id: 'my-unique-id',
			abbreviation: 'foo',
			name: 'bar',
		})
		.execute();
}
