import { describe, test } from 'vitest';
import { Column, is } from '~/index.ts';
import { PgColumn, PgSerial, pgTable, serial } from '~/pg-core/index.ts';

const pgExampleTable = pgTable('test', {
	a: serial('a').array(),
});

describe.concurrent('is', () => {
	test('Column', ({ expect }) => {
		expect(is(pgExampleTable.a, Column)).toBe(true);
		expect(is(pgExampleTable.a, PgColumn)).toBe(true);
		// With the new array approach, array columns are still the base column type (e.g., PgSerial)
		// with dimensions set, not a separate PgArray class
		expect(is(pgExampleTable.a, PgSerial)).toBe(true);
		expect(pgExampleTable.a.dimensions).toBe(1);
	});
});
