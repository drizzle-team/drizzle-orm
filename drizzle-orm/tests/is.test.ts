import postgres from 'postgres';
import { describe, test } from 'vitest';
import { Column, is, SQL } from '~/index.ts';
import { jsonb, PgArray, PgColumn, PgSerial, pgTable, serial, text } from '~/pg-core/index.ts';
import { drizzle } from '~/postgres-js/index.ts';
import { eq } from '~/sql/index.ts';

const pgExampleTable = pgTable('test', {
	a: serial('a').array(),
});

const nullProtoTable = pgTable('null_proto_test', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	data: jsonb('data'),
});

const db = drizzle(postgres(''));

describe.concurrent('is', () => {
	test('Column', ({ expect }) => {
		expect(is(pgExampleTable.a, Column)).toBe(true);
		expect(is(pgExampleTable.a, PgColumn)).toBe(true);
		expect(is(pgExampleTable.a, PgArray)).toBe(true);
		expect(is(pgExampleTable.a, PgSerial)).toBe(false);
	});

	test('Object.create(null) value does not throw', ({ expect }) => {
		const nullProtoValue = Object.create(null);
		expect(is(nullProtoValue, SQL)).toBe(false);
		expect(is(nullProtoValue, Column)).toBe(false);
	});

	test('insert with Object.create(null) value', ({ expect }) => {
		const jsonValue = Object.create(null);
		jsonValue.key = 'value';

		const query = db
			.insert(nullProtoTable)
			.values({ name: 'test', data: jsonValue });

		expect(query.toSQL()).toBeTruthy();
	});

	test('update with Object.create(null) value', ({ expect }) => {
		const jsonValue = Object.create(null);
		jsonValue.key = 'value';

		const query = db
			.update(nullProtoTable)
			.set({ data: jsonValue })
			.where(eq(nullProtoTable.id, 1));

		expect(query.toSQL()).toBeTruthy();
	});
});
