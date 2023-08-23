import { describe, test } from 'vitest';
import { Column, is } from '~/index.ts';
import { PgArray, PgColumn, PgSerial, pgTable, serial } from '~/pg-core/index.ts';

const pgExampleTable = pgTable('test', {
	a: serial('a').array(),
});

describe.concurrent('is', () => {
	test('Column', ({ expect }) => {
		expect(is(pgExampleTable.a, Column)).toBe(true);
		expect(is(pgExampleTable.a, PgColumn)).toBe(true);
		expect(is(pgExampleTable.a, PgArray)).toBe(true);
		expect(is(pgExampleTable.a, PgSerial)).toBe(false);
	});
});
