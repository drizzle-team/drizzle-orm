import { describe, expect, test } from 'vitest';
import type { AnyColumn } from '~/column';
import { date, integer, pgTable, text } from '~/pg-core';
import { defineRelations, relationsFilterToSQL, relationsOrderToSQL } from '~/relations';
import type { OrderBy, OrderByOperators, TableFilter } from '~/relations';
import {
	and,
	arrayContained,
	arrayContains,
	arrayOverlaps,
	asc,
	desc,
	eq,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	not,
	notIlike,
	notInArray,
	notLike,
	or,
	type SQL,
	sql,
} from '~/sql';
import type { AnyTable, Table } from '~/table';
import type { Simplify, ValueOrArray } from '~/utils';

const table = pgTable('test', {
	string: text(),
	number: integer(),
	arr: integer().array(),
	date: date('date', {
		mode: 'date',
	}),
});

const buildFilter = <TTable extends Table>(table: TTable, filter: TableFilter<TTable>) =>
	relationsFilterToSQL(table, filter as TableFilter);

describe('Filters', () => {
	test('No shortcuts for object-type data', () => {
		try {
			buildFilter(table, {
				// @ts-expect-error
				date: new Date(),
			});
			buildFilter(table, {
				date: sql.placeholder('date'),
			});
			buildFilter(table, {
				date: {
					eq: new Date(),
				},
			});
			buildFilter(table, {
				date: {
					eq: sql.placeholder('date'),
				},
			});
		} catch {
			return;
		}
	});

	test('eq shortcut', () => {
		expect(buildFilter(table, {
			number: 1,
		})).toStrictEqual(and(eq(table.number, 1)));
	});

	test('eq', () => {
		expect(buildFilter(table, {
			number: {
				eq: 2,
			},
			date: undefined,
		})).toStrictEqual(and(and(eq(table.number, 2))));
	});

	test('ne', () => {
		expect(buildFilter(table, {
			number: {
				ne: 2,
			},
			date: undefined,
		})).toStrictEqual(and(and(ne(table.number, 2))));
	});

	test('gt', () => {
		expect(buildFilter(table, {
			number: {
				gt: 2,
			},
		})).toStrictEqual(and(and(gt(table.number, 2))));
	});

	test('gte', () => {
		expect(buildFilter(table, {
			number: {
				gte: 2,
			},
		})).toStrictEqual(and(and(gte(table.number, 2))));
	});

	test('lt', () => {
		expect(buildFilter(table, {
			number: {
				lt: 2,
			},
		})).toStrictEqual(and(and(lt(table.number, 2))));
	});

	test('lte', () => {
		expect(buildFilter(table, {
			number: {
				lte: 2,
			},
		})).toStrictEqual(and(and(lte(table.number, 2))));
	});

	test('ilike', () => {
		expect(buildFilter(table, {
			string: {
				ilike: '%I',
			},
		})).toStrictEqual(and(and(ilike(table.string, '%I'))));
	});

	test('like', () => {
		expect(buildFilter(table, {
			string: {
				like: '%I',
			},
		})).toStrictEqual(and(and(like(table.string, '%I'))));
	});

	test('notIlike', () => {
		expect(buildFilter(table, {
			string: {
				notIlike: '%I',
			},
		})).toStrictEqual(and(and(notIlike(table.string, '%I'))));
	});

	test('notLike', () => {
		expect(buildFilter(table, {
			string: {
				notLike: '%I',
			},
		})).toStrictEqual(and(and(notLike(table.string, '%I'))));
	});

	test('in', () => {
		expect(buildFilter(table, {
			number: {
				in: [2, 3],
			},
		})).toStrictEqual(and(and(inArray(table.number, [2, 3]))));
	});

	test('notIn', () => {
		expect(buildFilter(table, {
			number: {
				notIn: [2, 3],
			},
		})).toStrictEqual(and(and(notInArray(table.number, [2, 3]))));
	});

	test('arrayContains', () => {
		expect(buildFilter(table, {
			arr: {
				arrayContains: [2, 3],
			},
		})).toStrictEqual(and(and(arrayContains(table.arr, [2, 3]))));
	});

	test('arrayContained', () => {
		expect(buildFilter(table, {
			arr: {
				arrayContained: [2, 3],
			},
		})).toStrictEqual(and(and(arrayContained(table.arr, [2, 3]))));
	});

	test('arrayOverlaps', () => {
		expect(buildFilter(table, {
			arr: {
				arrayOverlaps: [2, 3],
			},
		})).toStrictEqual(and(and(arrayOverlaps(table.arr, [2, 3]))));
	});

	test('isNotNull', () => {
		expect(buildFilter(table, {
			number: {
				isNotNull: true,
			},
		})).toStrictEqual(and(and(isNotNull(table.number))));
	});

	test('isNull', () => {
		expect(buildFilter(table, {
			number: {
				isNull: true,
			},
		})).toStrictEqual(and(and(isNull(table.number))));
	});

	test('column NOT', () => {
		expect(buildFilter(table, {
			number: {
				NOT: {
					isNull: true,
				},
			},
		})).toStrictEqual(and(and(not(and(isNull(table.number))!))));
	});

	test('column OR', () => {
		expect(buildFilter(table, {
			number: {
				OR: [{
					isNull: true,
				}, {
					isNotNull: true,
				}],
			},
		})).toStrictEqual(and(and(or(and(isNull(table.number)), and(isNotNull(table.number))!))));
	});

	test('RAW', () => {
		expect(buildFilter(table, {
			RAW: (t, { sql }) => sql`${t} ${t.string} ${t.date} ${t.number}`,
		})).toStrictEqual(and(sql`${table} ${table.string} ${table.date} ${table.number}`));
	});

	test('NOT', () => {
		expect(buildFilter(table, {
			NOT: {
				number: {
					eq: 2,
				},
			},
		})).toStrictEqual(and(not(and(and(eq(table.number, 2)))!)));
	});

	test('NOT', () => {
		expect(buildFilter(table, {
			OR: [{
				number: {
					eq: 2,
				},
			}, {
				string: 'str',
			}],
		})).toStrictEqual(and(
			or(
				and(and(eq(table.number, 2))),
				and(eq(table.string, 'str')),
			)!,
		));
	});

	test('AND', () => {
		expect(buildFilter(table, {
			number: {
				OR: [1, 2],
			},
			string: 'str',
		})).toStrictEqual(and(
			and(or(eq(table.number, 1), eq(table.number, 2))),
			eq(table.string, 'str'),
		));
	});
});

const buildOrder = <TTable extends Table>(
	table: TTable,
	order:
		| {
			[K in keyof TTable['_']['columns']]?: 'asc' | 'desc' | undefined;
		}
		| ((
			fields: Simplify<
				AnyTable<TTable['_']> & TTable['_']['columns']
			>,
			operators: OrderByOperators,
		) => ValueOrArray<AnyColumn | SQL>),
) => relationsOrderToSQL(table, order as OrderBy);

describe('Orders', () => {
	test('Callback column', () => {
		expect(buildOrder(table, ({ date }) => date)).toStrictEqual(asc(table.date));
	});

	test('Callback SQL', () => {
		expect(buildOrder(table, ({ date }, { desc }) => desc(date))).toStrictEqual(desc(table.date));
	});

	test('Callback array', () => {
		expect(buildOrder(table, ({ date, number, string }, { asc, desc }) => [desc(date), asc(number), string]))
			.toStrictEqual(sql.join([desc(table.date), asc(table.number), asc(table.string)], sql`, `));
	});

	test('Object', () => {
		expect(buildOrder(table, {
			string: 'desc',
			number: undefined,
			date: 'asc',
		})).toStrictEqual(sql.join([desc(table.string), asc(table.date)], sql`, `));
	});

	test('Undefined object', () => {
		expect(buildOrder(table, {
			number: undefined,
			date: undefined,
		})).toStrictEqual(undefined);
	});

	test('Empty object', () => {
		expect(buildOrder(table, {})).toStrictEqual(undefined);
	});
});

test('Relation & colum names collision', () => {
	expect(() =>
		defineRelations({ table }, (r) => ({
			table: {
				string: r.one.table(),
			},
		}))
	).toThrowError(
		`relations -> table: { string: r.one.table(...) }: relation name collides with column "string" of table "table"`,
	);
});
