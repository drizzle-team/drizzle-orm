import { describe, test } from 'vitest';
import { customType, integer, pgTable } from '~/pg-core/index.ts';
import { avg, avgDistinct, sum, sumDistinct } from '~/sql/functions/aggregate.ts';

const money = customType<{ data: { usd: string }; driverData: string }>({
	dataType: () => 'numeric(10, 2)',
	fromDriver: (value) => ({ usd: String(value) }),
	toDriver: (value) => value.usd,
});

const accounts = pgTable('accounts', {
	id: integer('id').primaryKey(),
	balance: money('balance').notNull(),
	plainBalance: integer('plain_balance').notNull(),
});

describe.concurrent('aggregate functions', () => {
	/**
	 * @see https://github.com/drizzle-team/drizzle-orm/issues/6085
	 */
	test("sum() and avg() run a customType column's mapFromDriverValue, same as max()/min()", ({ expect }) => {
		expect((sum(accounts.balance) as any).decoder.mapFromDriverValue('20.20')).toEqual({ usd: '20.20' });
		expect((sumDistinct(accounts.balance) as any).decoder.mapFromDriverValue('20.20')).toEqual({ usd: '20.20' });
		expect((avg(accounts.balance) as any).decoder.mapFromDriverValue('10.10')).toEqual({ usd: '10.10' });
		expect((avgDistinct(accounts.balance) as any).decoder.mapFromDriverValue('10.10')).toEqual({ usd: '10.10' });
	});

	test('sum() and avg() still map plain (non-customType) columns through String', ({ expect }) => {
		expect((sum(accounts.plainBalance) as any).decoder.mapFromDriverValue('123.45')).toBe('123.45');
		expect((sumDistinct(accounts.plainBalance) as any).decoder.mapFromDriverValue('123.45')).toBe('123.45');
		expect((avg(accounts.plainBalance) as any).decoder.mapFromDriverValue('123.45')).toBe('123.45');
		expect((avgDistinct(accounts.plainBalance) as any).decoder.mapFromDriverValue('123.45')).toBe('123.45');
	});
});
