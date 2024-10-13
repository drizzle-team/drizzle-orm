import { describe, test } from 'vitest';
import { Column, entityKind, is } from '~/index.ts';
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

	test('entityKind prototype chain', ({ expect }) => {
		class A1 {
			static readonly [entityKind]: string = 'A';
		}
		class A2 {
			static readonly [entityKind]: string = 'A';
		}

		class B1 extends A1 {
			static readonly [entityKind]: string = 'B';
		}

		class B2 extends B1 {
			static readonly [entityKind]: string = 'B';
		}

		const b1 = new B1();

		expect(is(b1, B1)).toBe(true);
		expect(is(b1, A1)).toBe(true);
		expect(is(b1, B2)).toBe(true);
		expect(is(b1, A2)).toBe(true);
	});
});
