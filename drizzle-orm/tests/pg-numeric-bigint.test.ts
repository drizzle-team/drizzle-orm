import { describe, it } from 'vitest';
import { numeric, pgTable } from '~/pg-core/index.ts';

const table = pgTable('test', {
	amount: numeric('amount', { precision: 10, scale: 2, mode: 'bigint' }),
	whole: numeric('whole', { precision: 20, scale: 0, mode: 'bigint' }),
});

describe.concurrent('PgNumericBigInt.mapFromDriverValue', () => {
	it('parses scale-0 integer string', ({ expect }) => {
		// `numeric(p, 0)` columns return strings without a decimal point.
		expect(table.whole.mapFromDriverValue('123')).toEqual(123n);
	});

	it('strips all-zero fractional part (primary fix path)', ({ expect }) => {
		// pg driver returns `"123.00"` for an integral value stored in a `numeric(p, 2)` column.
		// Before the fix, `BigInt("123.00")` threw `SyntaxError`. After the fix, the all-zero
		// fractional part is stripped and the integral value is returned exactly.
		expect(table.amount.mapFromDriverValue('123.00')).toEqual(123n);
	});

	it('strips arbitrary-length all-zero fractional part', ({ expect }) => {
		expect(table.amount.mapFromDriverValue('42.000000')).toEqual(42n);
	});

	it('throws SyntaxError on non-zero fractional part', ({ expect }) => {
		// A `mode: 'bigint'` column holding a genuinely non-integral value cannot be represented
		// as a bigint without silent data loss. The original `BigInt()` SyntaxError is preserved
		// rather than silently truncating to `123n`.
		expect(() => table.amount.mapFromDriverValue('123.45')).toThrowError(SyntaxError);
	});

	it('preserves negative integral values', ({ expect }) => {
		expect(table.amount.mapFromDriverValue('-7.00')).toEqual(-7n);
	});

	it('handles zero', ({ expect }) => {
		expect(table.amount.mapFromDriverValue('0.00')).toEqual(0n);
		expect(table.whole.mapFromDriverValue('0')).toEqual(0n);
	});

	it('coerces non-string drivers values via String() before parsing', ({ expect }) => {
		// The pg driver always returns strings, but `mapFromDriverValue` accepts `unknown` and
		// uses `String(value)` internally. Confirm the no-dot path still works for a number.
		expect(table.whole.mapFromDriverValue(42 as unknown)).toEqual(42n);
	});
});
