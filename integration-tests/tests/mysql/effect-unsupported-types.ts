// Redefinitions of shared Effect tests for `@effect/sql-mysql2`: its client reads results in the binary protocol, which
// drops zero fractional digits of temporal text (`00:00:00.000` -> `00:00:00`) with no per-query alternative - the
// copies below use such values unpadded. Drivers skip the originals by the exported names and register the copies via
// `addTests`.
import { expect, Vitest } from '@effect/vitest';
import { eq, sql } from 'drizzle-orm';
import { date, datetime, int, mysqlTable, time, timestamp, year } from 'drizzle-orm/mysql-core';
import * as Effect from 'effect/Effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { withUpstashCache } from '~/upstash-cache';
import { type AllTypesReplacements, assertAllTypesWithReplacements, makeAllTypes } from './all-types';
import { DB, push, type RunCommonEffectMySqlTestsOptions } from './effect-common';

/** Shared tests holding temporal text with zero fractional digits, redefined by {@link unpaddedFractionTests} */
export const unpaddedFractionSkips = ['date and time columns keep UTC values regardless of process timezone'];

/** Copies of {@link unpaddedFractionSkips} with unpadded temporal text */
export const unpaddedFractionTests = (
	it: Vitest.MethodsNonLive<DB | SqlClient>,
	createDB: RunCommonEffectMySqlTestsOptions['createDB'],
) => {
	it.effect('date and time columns keep UTC values regardless of process timezone (unpadded fractions)', () =>
		Effect.gen(function*() {
			const datesTable = mysqlTable('dates_tz_1', {
				id: int('id').primaryKey(),
				date: date('date').notNull(),
				dateStr: date('date_str', { mode: 'string' }).notNull(),
				datetime: datetime('datetime', { fsp: 3 }).notNull(),
				datetimeStr: datetime('datetime_str', { fsp: 3, mode: 'string' }).notNull(),
				timestamp: timestamp('timestamp', { fsp: 3 }).notNull(),
				timestampStr: timestamp('timestamp_str', { fsp: 3, mode: 'string' }).notNull(),
				time: time('time', { fsp: 3 }).notNull(),
				year: year('year').notNull(),
			});
			const db = yield* createDB({ datesTable }, (r) => ({
				datesTable: { self: r.many.datesTable({ from: r.datesTable.id, to: r.datesTable.id }) },
			}));

			yield* push(db, { datesTable });

			const startOfDay = new Date('2022-11-11T00:00:00.000Z');
			const endOfDay = new Date('2022-11-11T23:59:59.999Z');
			const rows = [{
				id: 1,
				date: new Date('2022-11-11'),
				dateStr: '2022-11-11',
				datetime: startOfDay,
				datetimeStr: '2022-11-11 00:00:00',
				timestamp: startOfDay,
				timestampStr: '2022-11-11 00:00:00',
				time: '00:00:00',
				year: 2022,
			}, {
				id: 2,
				date: new Date('2022-11-11'),
				dateStr: '2022-11-11',
				datetime: endOfDay,
				datetimeStr: '2022-11-11 23:59:59.999',
				timestamp: endOfDay,
				timestampStr: '2022-11-11 23:59:59.999',
				time: '23:59:59.999',
				year: 2022,
			}];

			const pad = (value: string) => value.includes('.') ? value : `${value}.000`;
			const padded = (row: (typeof rows)[number]) => ({
				...row,
				datetimeStr: pad(row.datetimeStr),
				timestampStr: pad(row.timestampStr),
				time: pad(row.time),
			});

			const originalTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			yield* Effect.gen(function*() {
				for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
					process.env['TZ'] = tz;

					yield* db.delete(datesTable);
					yield* db.insert(datesTable).values(rows.map((row) => ({ ...row, date: row.datetime })));

					const stored = yield* db.select({
						id: datesTable.id,
						date: sql<string>`cast(${datesTable.date} as char)`,
						datetime: sql<string>`cast(${datesTable.datetime} as char)`,
						timestamp: sql<string>`cast(${datesTable.timestamp} as char)`,
					}).from(datesTable).orderBy(datesTable.id);
					expect(stored, tz).toStrictEqual(
						rows.map((row) => ({
							id: row.id,
							date: row.dateStr,
							// text the server formats keeps the column's fractional digits
							datetime: pad(row.datetimeStr),
							timestamp: pad(row.timestampStr),
						})),
					);

					expect(yield* db.select().from(datesTable).orderBy(datesTable.id), tz).toStrictEqual(rows);
					expect(yield* db.select().from(datesTable).where(eq(datesTable.date, endOfDay)).orderBy(datesTable.id), tz)
						.toStrictEqual(rows);
					expect(yield* db.select().from(datesTable).where(eq(datesTable.datetime, endOfDay)), tz).toStrictEqual([
						rows[1]!,
					]);
					expect(yield* db.select().from(datesTable).where(eq(datesTable.timestamp, startOfDay)), tz)
						.toStrictEqual([rows[0]!]);

					// nested relations are decoded from JSON, whose temporal text keeps the column's fractional digits
					expect(yield* db.query.datesTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } }), tz)
						.toStrictEqual(rows.map((row) => ({ ...row, self: [padded(row)] })));
				}
			}).pipe(Effect.ensuring(Effect.sync(() => {
				process.env['TZ'] = originalTz;
			})));
		}));
};

/** Shared all-types tests, redefined by {@link allTypesWithReplacementsTests} */
export const allTypesWithReplacementsSkips = [
	'all types',
	'all types - upstash',
	'all types ~codecs~',
	'all types ~codecs~ - upstash',
];

/** All-types round trips with values replaced. Unions, bounds and temporal bounds of the original tests aren't repeated */
export const allTypesWithReplacementsTests = (
	it: Vitest.MethodsNonLive<DB | SqlClient>,
	createDB: RunCommonEffectMySqlTestsOptions['createDB'],
	replacements: AllTypesReplacements,
	/** Replacements of values of relations nested in relational queries, which are decoded from JSON */
	nested: AllTypesReplacements = replacements,
) => {
	const relations = (r: any) => ({
		allTypesTable: { self: r.many.allTypesTable({ from: r.allTypesTable.serial, to: r.allTypesTable.serial }) },
	});

	it.effect('all types (with replacements)', () =>
		Effect.gen(function*() {
			const allTypesTable = makeAllTypes('all_types_replaced_ef');
			const db = yield* createDB({ allTypesTable }, relations);
			yield* push(db, { allTypesTable });

			const context = yield* Effect.context<never>();
			const run = (query: any) => Effect.runPromiseWith(context)(query);
			yield* Effect.promise(() =>
				assertAllTypesWithReplacements(db as any, allTypesTable as any, replacements, { run, rqb: true, nested })
			);
		}));

	it.effect('all types (with replacements) - upstash', () =>
		withUpstashCache((cache, run) =>
			Effect.gen(function*() {
				const allTypesTable = makeAllTypes('all_types_replaced_upstash_ef');
				const db = yield* createDB({ allTypesTable }, relations, false, cache);
				yield* push(db, { allTypesTable });

				yield* Effect.promise(() =>
					cache.expectHits(
						'all types',
						() =>
							assertAllTypesWithReplacements(db as any, allTypesTable as any, replacements, { run, rqb: true, nested }),
					)
				);
			})
		));
};
