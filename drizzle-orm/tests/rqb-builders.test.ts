import { describe, expect, test } from 'vitest';
import type { AnyColumn } from '~/column';
import { boolean, date, integer, pgTable, text } from '~/pg-core';
import { drizzle } from '~/pglite';
import {
	defineRelations,
	EmptyFilter,
	relationExtrasToSQL,
	relationsFilterToSQL,
	relationsOrderToSQL,
} from '~/relations';
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
	StringChunk,
} from '~/sql';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from '~/sqlite-core';
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

// oxlint-disable-next-line unicorn/no-useless-undefined
const returnUndefined = () => undefined;

const buildFilter = <TTable extends Table>(table: TTable, filter: TableFilter<TTable>) =>
	relationsFilterToSQL(table, filter as TableFilter).sql;

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
			date: EmptyFilter,
		})).toStrictEqual(and(and(eq(table.number, 2))));
	});

	test('ne', () => {
		expect(buildFilter(table, {
			number: {
				ne: 2,
			},
			date: EmptyFilter,
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

	test('EmptyFilter skips column field', () => {
		expect(buildFilter(table, {
			number: {
				eq: 2,
			},
			string: EmptyFilter,
			date: EmptyFilter,
		})).toStrictEqual(and(and(eq(table.number, 2))));
	});

	test('EmptyFilter skips field operator', () => {
		expect(buildFilter(table, {
			number: {
				eq: 2,
				gt: EmptyFilter,
			},
		})).toStrictEqual(and(and(eq(table.number, 2))));
	});

	test('EmptyFilter as whole filter returns undefined', () => {
		expect(relationsFilterToSQL(table, EmptyFilter)).toStrictEqual({ sql: undefined, hasRelationFilters: false });
	});

	test('undefined column field throws', () => {
		expect(() =>
			buildFilter(table, {
				date: undefined,
			})
		).toThrowError(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	});

	test('undefined field operator throws', () => {
		expect(() =>
			buildFilter(table, {
				number: {
					eq: undefined,
				},
			})
		).toThrowError(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	});

	test('undefined whole filter throws', () => {
		expect(() => relationsFilterToSQL(table, undefined)).toThrowError(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	});

	test('undefined in field OR array throws', () => {
		expect(() =>
			buildFilter(table, {
				number: {
					// @ts-expect-error
					OR: [{ eq: 2 }, undefined],
				},
			})
		).toThrowError(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	});

	test('undefined in field AND array throws', () => {
		expect(() =>
			buildFilter(table, {
				number: {
					// @ts-expect-error
					AND: [undefined],
				},
			})
		).toThrowError(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	});

	test('undefined nested in field NOT -> OR array throws', () => {
		expect(() =>
			buildFilter(table, {
				number: {
					// @ts-expect-error
					NOT: { OR: [undefined] },
				},
			})
		).toThrowError(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	});

	test('EmptyFilter in field OR array is skipped', () => {
		expect(buildFilter(table, {
			number: {
				OR: [EmptyFilter, { eq: 2 }],
			},
		})).toStrictEqual(buildFilter(table, {
			number: {
				OR: [{ eq: 2 }],
			},
		}));
	});

	test('EmptyFilter in field OR array alongside shortcut values', () => {
		expect(buildFilter(table, {
			number: {
				OR: [1, EmptyFilter, 2],
			},
		})).toStrictEqual(and(and(or(eq(table.number, 1), eq(table.number, 2)))));
	});

	test('EmptyFilter in field OR array alongside placeholder', () => {
		expect(buildFilter(table, {
			number: {
				OR: [sql.placeholder('n'), EmptyFilter],
			},
		})).toStrictEqual(and(and(or(eq(table.number, sql.placeholder('n'))))));
	});

	test('EmptyFilter in field AND array is skipped', () => {
		expect(buildFilter(table, {
			number: {
				AND: [{ gt: 1 }, EmptyFilter, 3],
			},
		})).toStrictEqual(and(and(and(and(gt(table.number, 1)), eq(table.number, 3)))));
	});

	test('Field NOT over OR of only EmptyFilter is skipped', () => {
		expect(buildFilter(table, {
			number: {
				NOT: { OR: [EmptyFilter] },
			},
			string: 'str',
		})).toStrictEqual(and(eq(table.string, 'str')));
	});

	test('Field value types are still checked next to EmptyFilter', () => {
		expect(() =>
			buildFilter(table, {
				number: {
					// @ts-expect-error
					OR: [EmptyFilter, 'str'],
				},
			})
		).not.toThrow();
	});

	test('undefined in relation-level structural keys throws', () => {
		for (const key of ['OR', 'AND', 'NOT', 'RAW'] as const) {
			expect(() => buildFilter(table, { [key]: undefined }), `${key}: undefined`).toThrowError(
				`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
			);
		}
	});

	test('OR set to EmptyFilter is skipped', () => {
		expect(buildFilter(table, { OR: EmptyFilter })).toStrictEqual(undefined);
		expect(buildFilter(table, { OR: EmptyFilter, number: 1 })).toStrictEqual(and(eq(table.number, 1)));
	});

	test('AND set to EmptyFilter is skipped', () => {
		expect(buildFilter(table, { AND: EmptyFilter })).toStrictEqual(undefined);
		expect(buildFilter(table, { AND: EmptyFilter, number: 1 })).toStrictEqual(and(eq(table.number, 1)));
	});

	test('NOT set to EmptyFilter is skipped', () => {
		expect(buildFilter(table, { NOT: EmptyFilter })).toStrictEqual(undefined);
		expect(buildFilter(table, { NOT: EmptyFilter, number: 1 })).toStrictEqual(and(eq(table.number, 1)));
	});

	test('RAW set to EmptyFilter is skipped', () => {
		expect(buildFilter(table, { RAW: EmptyFilter })).toStrictEqual(undefined);
		expect(buildFilter(table, { RAW: EmptyFilter, number: 1 })).toStrictEqual(and(eq(table.number, 1)));
	});

	test('RAW callback returning EmptyFilter is skipped', () => {
		expect(buildFilter(table, { RAW: () => EmptyFilter })).toStrictEqual(undefined);
		expect(buildFilter(table, { RAW: () => EmptyFilter, number: 1 })).toStrictEqual(and(eq(table.number, 1)));
	});

	test('RAW callback returning SQL still applies', () => {
		expect(buildFilter(table, { RAW: (t, { sql }) => sql`${t.number} > 1` }))
			.toStrictEqual(and(sql`${table.number} > 1`));
	});

	test('empty field OR array throws', () => {
		expect(() =>
			buildFilter(table, {
				number: {
					OR: [],
				},
			})
		).toThrowError(
			"Unexpected empty array in filters' 'OR' section. Omit field or use 'EmptyFilter' if you want filter to be skipped.",
		);
	});

	test('empty field AND array throws', () => {
		expect(() =>
			buildFilter(table, {
				number: {
					AND: [],
				},
			})
		).toThrowError(
			"Unexpected empty array in filters' 'AND' section. Omit field or use 'EmptyFilter' if you want filter to be skipped.",
		);
	});

	test('empty relation-level OR array throws', () => {
		expect(() => buildFilter(table, { OR: [] })).toThrowError(
			"Unexpected empty array in filters' 'OR' section. Omit field or use 'EmptyFilter' if you want filter to be skipped.",
		);
	});

	test('empty relation-level AND array throws', () => {
		expect(() => buildFilter(table, { AND: [] })).toThrowError(
			"Unexpected empty array in filters' 'AND' section. Omit field or use 'EmptyFilter' if you want filter to be skipped.",
		);
	});

	test('nested empty array throws through recursion', () => {
		expect(() =>
			buildFilter(table, {
				AND: [{ OR: [] }],
			})
		).toThrowError(
			"Unexpected empty array in filters' 'OR' section. Omit field or use 'EmptyFilter' if you want filter to be skipped.",
		);
	});

	test('array of only EmptyFilter is skipped, not treated as empty', () => {
		expect(buildFilter(table, { number: { OR: [EmptyFilter] } })).toStrictEqual(undefined);
		expect(buildFilter(table, { OR: [EmptyFilter] })).toStrictEqual(undefined);
		expect(buildFilter(table, { AND: [EmptyFilter] })).toStrictEqual(undefined);
	});

	test('Nothing generates for empty OR', () => {
		expect(buildFilter(table, {
			OR: [
				{ number: EmptyFilter },
				{ string: EmptyFilter, date: EmptyFilter },
				{ number: { eq: EmptyFilter, gt: EmptyFilter } },
			],
		})).toStrictEqual(undefined);
	});

	test('Nothing generates for empty AND', () => {
		expect(buildFilter(table, {
			AND: [
				{ number: EmptyFilter },
				{ OR: [{ string: EmptyFilter }] },
				{ NOT: { number: EmptyFilter } },
			],
		})).toStrictEqual(undefined);
	});

	test('Non-empty OR with empty elements', () => {
		expect(buildFilter(table, {
			OR: [
				{ number: EmptyFilter },
				{ string: 'str' },
				{ date: EmptyFilter },
			],
		})).toStrictEqual(and(or(and(eq(table.string, 'str')))!));
	});

	test('Non-empty AND with empty elements', () => {
		expect(buildFilter(table, {
			AND: [
				{ number: EmptyFilter },
				{ string: 'str' },
				{ number: { gt: 2, lt: EmptyFilter } },
			],
		})).toStrictEqual(and(
			and(
				and(eq(table.string, 'str')),
				and(and(gt(table.number, 2))),
			)!,
		));
	});

	test('Nothing generates for deep empty AND, OR, NOT', () => {
		expect(buildFilter(table, {
			AND: [{
				OR: [{
					NOT: {
						AND: [{ number: EmptyFilter }, { string: { OR: [{ in: EmptyFilter }] } }],
					},
				}, {
					number: {
						NOT: EmptyFilter,
						AND: [{ gt: EmptyFilter }],
					},
				}],
			}],
		})).toStrictEqual(undefined);
	});

	test('Nothing generates for deep empty AND, OR, NOT, non-empty values preserved', () => {
		expect(buildFilter(table, {
			AND: [{
				OR: [
					{ number: EmptyFilter },
					{ AND: [{ string: EmptyFilter }, { number: { in: [1, 2], gt: EmptyFilter } }] },
				],
			}],
		})).toStrictEqual(and(and(and(
			or(
				and(and(and(and(inArray(table.number, [1, 2]))))),
			)!,
		))));
	});

	test('Column-level OR/AND nested with EmptyFilter branches', () => {
		expect(buildFilter(table, {
			number: {
				OR: [
					{ AND: [{ gt: 1 }, { lt: EmptyFilter }] },
					{ NOT: { eq: EmptyFilter } },
				],
			},
		})).toStrictEqual(and(and(or(and(and(and(gt(table.number, 1)))))!)));
	});

	test('Nothing generates for empty column-level nested NOT', () => {
		expect(buildFilter(table, {
			number: {
				NOT: { eq: EmptyFilter, OR: [{ eq: EmptyFilter }] },
			},
			string: 'str',
		})).toStrictEqual(and(eq(table.string, 'str')));
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
		) => ValueOrArray<AnyColumn | SQL> | undefined),
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
			.toStrictEqual(sql.join([desc(table.date), asc(table.number), asc(table.string)], new StringChunk(`, `)));
	});

	test('Object', () => {
		expect(buildOrder(table, {
			string: 'desc',
			number: undefined,
			date: 'asc',
		})).toStrictEqual(sql.join([desc(table.string), asc(table.date)], new StringChunk(`, `)));
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

	test('Callback returning undefined', () => {
		expect(buildOrder(table, returnUndefined)).toStrictEqual(undefined);
	});

	test('Callback returning empty array', () => {
		expect(buildOrder(table, () => [])).toStrictEqual(undefined);
	});
});

describe('Extras', () => {
	test('Callback returning undefined is skipped', () => {
		const res = relationExtrasToSQL(table, {
			skipped: returnUndefined,
		});
		expect(res.sql).toStrictEqual(undefined);
		expect(res.selection).toStrictEqual([]);
	});

	test('Callback returning undefined is skipped alongside kept extras', () => {
		const res = relationExtrasToSQL(table, {
			skipped: returnUndefined,
			keptCb: () => sql`1`,
			keptRaw: sql`1`,
			keptAs: sql`1`.as('1'),
		});
		expect(res.selection.map((s) => s.key)).toStrictEqual(['keptCb', 'keptRaw', 'keptAs']);
		expect(res.sql).not.toStrictEqual(undefined);
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

const users = pgTable('users', {
	id: integer(),
});
const posts = pgTable('posts', {
	id: integer(),
	authorId: integer(),
});

describe('Relation config where', () => {
	test('omitted where does not throw', () => {
		expect(() =>
			defineRelations({ users, posts }, (r) => ({
				users: {
					posts: r.many.posts({
						from: r.users.id,
						to: r.posts.authorId,
					}),
				},
			}))
		).not.toThrow();
	});

	test('EmptyFilter where does not throw', () => {
		expect(() =>
			defineRelations({ users, posts }, (r) => ({
				users: {
					posts: r.many.posts({
						from: r.users.id,
						to: r.posts.authorId,
						where: EmptyFilter,
					}),
				},
			}))
		).not.toThrow();
	});

	test('undefined where throws', () => {
		expect(() =>
			defineRelations({ users, posts }, (r) => ({
				users: {
					posts: r.many.posts({
						from: r.users.id,
						to: r.posts.authorId,
						where: undefined,
					}),
				},
			}))
		).toThrowError(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	});
});

describe('Reverse-derived relation filter binding (isFilterReversed)', () => {
	const filterUsers = pgTable('users', { id: integer(), name: text() });
	const filterPosts = pgTable('posts', { id: integer(), authorId: integer(), published: boolean() });
	const filterSchema = { users: filterUsers, posts: filterPosts };

	test('own where on a reverse-derived relation binds to the target table', () => {
		const db = drizzle.mock({
			relations: defineRelations(filterSchema, (r) => ({
				posts: { author: r.one.users({ from: r.posts.authorId, to: r.users.id }) },
				users: { posts: r.many.posts({ where: { published: true } }) },
			})),
		});

		const { sql } = db.query.users.findMany({ with: { posts: true } }).toSQL();
		expect(sql).toContain('where (("d0"."id" = "d1"."authorId") and ("d1"."published" = $1))');
		expect(sql).not.toContain('"d0"."published"');
	});

	test('inherited where on a reverse-derived relation binds to the source table', () => {
		const db = drizzle.mock({
			relations: defineRelations(filterSchema, (r) => ({
				posts: { author: r.one.users({ from: r.posts.authorId, to: r.users.id, where: { name: 'x' } }) },
				users: { posts: r.many.posts() },
			})),
		});

		const { sql } = db.query.users.findMany({ with: { posts: true } }).toSQL();
		expect(sql).toContain('where (("d0"."id" = "d1"."authorId") and ("d0"."name" = $1))');
		expect(sql).not.toContain('"d1"."name"');
	});
});

describe('Relation names shadowing Object.prototype properties', () => {
	const results = pgTable('results', { id: integer(), constructorId: integer() });
	const constructors = pgTable('constructors', { id: integer(), name: text() });
	const protoSchema = { results, constructors };

	test('relation named "constructor" does not falsely collide with columns', () => {
		expect(() =>
			defineRelations(protoSchema, (r) => ({
				results: {
					constructor: r.one.constructors({ from: r.results.constructorId, to: r.constructors.id }),
				},
			}))
		).not.toThrow();
	});

	test('filter on a relation named "constructor" builds a relation filter', () => {
		const db = drizzle.mock({
			relations: defineRelations(protoSchema, (r) => ({
				results: {
					constructor: r.one.constructors({ from: r.results.constructorId, to: r.constructors.id }),
				},
			})),
		});

		const { sql } = db.query.results.findMany({ where: { constructor: { id: 1 } } }).toSQL();
		expect(sql).toContain('exists (select * from "constructors" as "f0" where');
		expect(sql).not.toContain('"d0"."constructor"');
	});

	test('unknown filter field named after an inherited property throws', () => {
		expect(() =>
			buildFilter(table, {
				toString: {
					eq: 1,
				},
			} as any)
		).toThrowError('Unknown relational filter field: "toString"');
	});
});

describe('Relational filter EmptyFilter behavior', () => {
	const relUsers = pgTable('user', { id: integer(), a: text(), b: text() });
	const relData = pgTable('data', { id: integer(), userId: integer(), email: text(), username: text() });
	const relTags = pgTable('tags', { id: integer(), dataId: integer(), name: text() });
	const relSchema = { user: relUsers, data: relData, tags: relTags };

	const db = drizzle.mock({
		relations: defineRelations(relSchema, (r) => ({
			user: { data: r.many.data({ from: r.user.id, to: r.data.userId }) },
			data: { tags: r.many.tags({ from: r.data.id, to: r.tags.dataId }) },
		})),
	});

	test('Nothing generates for empty relational filter', () => {
		const { sql } = db.query.user.findMany({
			where: {
				data: {
					OR: [{ email: EmptyFilter }, { username: EmptyFilter }],
				},
			},
		}).toSQL();

		expect(sql).not.toContain('exists');
		expect(sql).not.toContain('where');
	});

	test('EmptyFilter values act as no values present', () => {
		const reduced = db.query.user.findMany({
			where: { a: 'x', data: { email: EmptyFilter, username: { eq: EmptyFilter } } },
		}).toSQL();
		const omitted = db.query.user.findMany({ where: { a: 'x' } }).toSQL();

		expect(reduced.sql).toStrictEqual(omitted.sql);
		expect(reduced.params).toStrictEqual(omitted.params);
	});

	test('Nothing generates for relational EmptyFilter', () => {
		const { sql } = db.query.user.findMany({ where: { data: EmptyFilter } }).toSQL();

		expect(sql).not.toContain('exists');
	});

	test('Nothing generates for Nested relational EmptyFilter', () => {
		const { sql } = db.query.user.findMany({
			where: {
				OR: [
					{ a: EmptyFilter },
					{ b: EmptyFilter },
					{ data: { OR: [{ email: EmptyFilter }, { username: EmptyFilter }] } },
				],
			},
		}).toSQL();

		expect(sql).not.toContain('exists');
		expect(sql).not.toContain('where');
	});

	test('Top level OR survives with non-empty value', () => {
		const { sql, params } = db.query.user.findMany({
			where: {
				OR: [
					{ a: 'x' },
					{ data: { OR: [{ email: EmptyFilter }, { username: EmptyFilter }] } },
				],
			},
		}).toSQL();

		expect(sql).not.toContain('exists');
		expect(sql).toContain('where "d0"."a" = $1');
		expect(params).toStrictEqual(['x']);
	});

	test('Top level AND survives with non-empty value', () => {
		const { sql, params } = db.query.user.findMany({
			where: {
				AND: [
					{ data: { email: EmptyFilter } },
					{ data: { username: 'u' } },
				],
			},
		}).toSQL();

		expect(sql).toContain('exists (select * from "data" as "f0" where (("d0"."id" = "f0"."userId")');
		expect(sql).toContain('"f0"."username" = $1');
		expect(params).toStrictEqual(['u']);
		expect(sql.match(/exists/g)).toHaveLength(1);
	});

	test('Nothing generates for nested empty relational filter', () => {
		const { sql } = db.query.user.findMany({
			where: {
				data: {
					tags: { name: EmptyFilter, OR: [{ id: EmptyFilter }] },
				},
			},
		}).toSQL();

		expect(sql).not.toContain('exists');
		expect(sql).not.toContain('where');
	});

	test('Nested relational filter keeps every EXISTS entry', () => {
		const { sql, params } = db.query.user.findMany({
			where: {
				data: {
					email: EmptyFilter,
					tags: { name: 't' },
				},
			},
		}).toSQL();

		expect(sql.match(/exists/g)).toHaveLength(2);
		expect(sql).toContain('"f1"."name" = $1');
		expect(params).toStrictEqual(['t']);
	});

	test('Nothing generates for keyless relational filter', () => {
		const { sql } = db.query.user.findMany({ where: { data: {} } }).toSQL();

		expect(sql).not.toContain('exists');
		expect(sql).not.toContain('where');
	});

	test('Boolean relational filter emits `exists` queries', () => {
		expect(db.query.user.findMany({ where: { data: true } }).toSQL().sql)
			.toContain('where exists (select * from "data" as "f0" where "d0"."id" = "f0"."userId")');
		expect(db.query.user.findMany({ where: { data: false } }).toSQL().sql)
			.toContain('where not exists (select * from "data" as "f0" where "d0"."id" = "f0"."userId")');
	});

	test('EmptyFilter in column-level OR array inside relational filter', () => {
		const { sql, params } = db.query.user.findMany({
			where: {
				data: {
					email: { OR: [EmptyFilter, 'e'] },
				},
			},
		}).toSQL();

		expect(sql.match(/exists/g)).toHaveLength(1);
		expect(sql).toContain('"f0"."email" = $1');
		expect(params).toStrictEqual(['e']);
	});

	test('Nothing generates for column-level arrays of only EmptyFilter', () => {
		const { sql } = db.query.user.findMany({
			where: {
				a: { OR: [EmptyFilter] },
				data: { email: { AND: [EmptyFilter] } },
			},
		}).toSQL();

		expect(sql).not.toContain('exists');
		expect(sql).not.toContain('where');
	});

	test('Nothing generates for NOT on empty relational filter', () => {
		const { sql } = db.query.user.findMany({
			where: {
				NOT: { data: { email: EmptyFilter } },
			},
		}).toSQL();

		expect(sql).not.toContain('exists');
		expect(sql).not.toContain('where');
	});
});

describe('Relational filter `hasRelationFilters` flag', () => {
	const flagUsers = pgTable('user', { id: integer(), a: text(), b: text() });
	const flagData = pgTable('data', { id: integer(), userId: integer(), email: text(), username: text() });
	const flagTags = pgTable('tags', { id: integer(), dataId: integer(), name: text() });

	const relations = defineRelations({ user: flagUsers, data: flagData, tags: flagTags }, (r) => ({
		user: { data: r.many.data({ from: r.user.id, to: r.data.userId }) },
		data: { tags: r.many.tags({ from: r.data.id, to: r.tags.dataId }) },
	}));

	// loosely typed: the filters are checked against generic table config otherwise
	const build = (filter: Record<string, unknown> | typeof EmptyFilter) =>
		relationsFilterToSQL(flagUsers, filter as TableFilter, relations.user.relations, relations, new Map());

	test('Unset for empty filters', () => {
		expect(build(EmptyFilter)).toStrictEqual({ sql: undefined, hasRelationFilters: false });
		expect(build({})).toStrictEqual({ sql: undefined, hasRelationFilters: false });
		expect(build({ a: EmptyFilter, RAW: EmptyFilter, OR: EmptyFilter })).toStrictEqual({
			sql: undefined,
			hasRelationFilters: false,
		});
	});

	test('Unset for filters on own columns', () => {
		expect(build({ a: 'x' }).hasRelationFilters).toStrictEqual(false);
		expect(build({ a: 'x', b: { OR: [{ eq: 'y' }, { isNull: true }] } }).hasRelationFilters).toStrictEqual(false);
		expect(build({ OR: [{ a: 'x' }, { AND: [{ b: 'y' }, { NOT: { id: 1 } }] }] }).hasRelationFilters)
			.toStrictEqual(false);
	});

	test('Set for filters on relations', () => {
		expect(build({ data: { email: 'x' } }).hasRelationFilters).toStrictEqual(true);
		expect(build({ data: true }).hasRelationFilters).toStrictEqual(true);
		expect(build({ data: false }).hasRelationFilters).toStrictEqual(true);
		expect(build({ a: 'x', data: { tags: { name: 'y' } } }).hasRelationFilters).toStrictEqual(true);
	});

	test('Set for filters on relations nested in `OR`, `AND`, `NOT`', () => {
		expect(build({ OR: [{ a: 'x' }, { data: { email: 'x' } }] }).hasRelationFilters).toStrictEqual(true);
		expect(build({ AND: [{ a: 'x' }, { data: { email: 'x' } }] }).hasRelationFilters).toStrictEqual(true);
		expect(build({ NOT: { data: { email: 'x' } } }).hasRelationFilters).toStrictEqual(true);
		expect(build({ OR: [{ a: 'x' }, { AND: [{ b: 'y' }, { NOT: { data: true } }] }] }).hasRelationFilters)
			.toStrictEqual(true);
	});

	test('Unset for filters on relations that build to nothing', () => {
		expect(build({ data: EmptyFilter })).toStrictEqual({ sql: undefined, hasRelationFilters: false });
		expect(build({ data: { email: EmptyFilter } })).toStrictEqual({ sql: undefined, hasRelationFilters: false });
		expect(build({ a: 'x', data: { OR: [{ email: EmptyFilter }, { tags: { name: EmptyFilter } }] } }))
			.toStrictEqual({ sql: and(eq(flagUsers.a, 'x')), hasRelationFilters: false });
		expect(build({ NOT: { data: { email: EmptyFilter } } }).hasRelationFilters).toStrictEqual(false);
	});

	test('Set for non-empty `RAW`: it may contain a subquery', () => {
		expect(build({ RAW: sql`1 = 1` }).hasRelationFilters).toStrictEqual(true);
		expect(build({ RAW: (t: typeof flagUsers) => sql`${t.id} > 1` }).hasRelationFilters).toStrictEqual(true);
		expect(build({ a: 'x', OR: [{ b: 'y' }, { RAW: sql`1 = 1` }] }).hasRelationFilters).toStrictEqual(true);
	});

	test('Unset for empty `RAW`', () => {
		expect(build({ RAW: EmptyFilter }).hasRelationFilters).toStrictEqual(false);
		expect(build({ RAW: () => EmptyFilter, a: 'x' }).hasRelationFilters).toStrictEqual(false);
	});
});

describe('Order by relations', () => {
	const orderUsers = pgTable('users', { id: integer(), name: text(), invitedBy: integer() });
	const orderPosts = pgTable('posts', { id: integer(), authorId: integer(), title: text(), score: integer() });
	const orderComments = pgTable('comments', { id: integer(), postId: integer(), likes: integer() });
	const orderGroups = pgTable('groups', { id: integer(), name: text() });
	const orderUsersToGroups = pgTable('users_to_groups', { userId: integer(), groupId: integer() });

	const db = drizzle.mock({
		relations: defineRelations({
			users: orderUsers,
			posts: orderPosts,
			comments: orderComments,
			groups: orderGroups,
			usersToGroups: orderUsersToGroups,
		}, (r) => ({
			users: {
				posts: r.many.posts({ from: r.users.id, to: r.posts.authorId }),
				topPosts: r.many.posts({
					from: r.users.id,
					to: r.posts.authorId,
					where: { score: { gt: 10 } },
					alias: 'top',
				}),
				inviter: r.one.users({ from: r.users.invitedBy, to: r.users.id }),
				groups: r.many.groups({
					from: r.users.id.through(r.usersToGroups.userId),
					to: r.groups.id.through(r.usersToGroups.groupId),
				}),
			},
			posts: {
				author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
				comments: r.many.comments({ from: r.posts.id, to: r.comments.postId }),
			},
			comments: { post: r.one.posts({ from: r.comments.postId, to: r.posts.id }) },
		})),
	});

	const orderOf = (query: { toSQL(): { sql: string } }) => query.toSQL().sql.split(' order by ').at(-1);

	test('Field of a single relation, mixed with own fields in the given order', () => {
		expect(orderOf(db.query.posts.findMany({ orderBy: { title: 'asc', author: { name: 'asc' }, id: 'desc' } })))
			.toStrictEqual(
				'"d0"."title" asc, (select "o0"."name" from "users" as "o0" where "d0"."authorId" = "o0"."id" limit 1) asc, "d0"."id" desc',
			);
	});

	test('Aggregated fields of a many relation', () => {
		expect(orderOf(db.query.users.findMany({
			orderBy: { posts: { score: 'desc(max)', id: 'asc(count)', title: 'asc(min)', authorId: 'desc(avg)' } },
		}))).toStrictEqual(
			[
				'(select max("o0"."score") from "posts" as "o0" where "d0"."id" = "o0"."authorId") desc',
				'(select count("o0"."id") from "posts" as "o0" where "d0"."id" = "o0"."authorId") asc',
				'(select min("o0"."title") from "posts" as "o0" where "d0"."id" = "o0"."authorId") asc',
				'(select avg("o0"."authorId") from "posts" as "o0" where "d0"."id" = "o0"."authorId") desc',
			].join(', '),
		);
	});

	test('First row of a many relation', () => {
		expect(orderOf(db.query.users.findMany({
			orderBy: { posts: { score: 'desc(first)', comments: { likes: 'asc(first)' } } },
		}))).toStrictEqual(
			[
				'(select "o0"."score" from "posts" as "o0" where "d0"."id" = "o0"."authorId" limit 1) desc',
				'(select "o1"."likes" from "posts" as "o0" cross join "comments" as "o1" where (("d0"."id" = "o0"."authorId") and ("o0"."id" = "o1"."postId")) limit 1) asc',
			].join(', '),
		);
	});

	test('Number of rows of a many relation', () => {
		const query = db.query.users.findMany({
			orderBy: {
				posts: 'desc(count)',
				groups: 'asc(count)',
				topPosts: 'desc(count)',
				inviter: { posts: 'asc(count)' },
				id: 'asc',
			},
		});

		expect(orderOf(query)).toStrictEqual(
			[
				'(select count(*) from "posts" as "o0" where "d0"."id" = "o0"."authorId") desc',
				'(select count(*) from "groups" as "o0" inner join "users_to_groups" as "ot0" on "ot0"."groupId" = "o0"."id" where "d0"."id" = "ot0"."userId") asc',
				'(select count(*) from "posts" as "o0" where (("d0"."id" = "o0"."authorId") and ("o0"."score" > $1))) desc',
				'(select count(*) from "users" as "o0" cross join "posts" as "o1" where (("d0"."invitedBy" = "o0"."id") and ("o0"."id" = "o1"."authorId"))) asc',
				'"d0"."id" asc',
			].join(', '),
		);
		expect(query.toSQL().params).toStrictEqual([10]);

		// rows of a many relation nested in a many relation are counted in total
		expect(orderOf(db.query.users.findMany({ orderBy: { posts: { comments: 'desc(count)' } } }))).toStrictEqual(
			'(select count(*) from "posts" as "o0" cross join "comments" as "o1" where (("d0"."id" = "o0"."authorId") and ("o0"."id" = "o1"."postId"))) desc',
		);
	});

	test('Nested single relations', () => {
		expect(orderOf(db.query.comments.findMany({ orderBy: { post: { author: { inviter: { name: 'desc' } } } } })))
			.toStrictEqual(
				'(select "o2"."name" from "posts" as "o0" cross join "users" as "o1" cross join "users" as "o2" where (("d0"."postId" = "o0"."id") and ("o0"."authorId" = "o1"."id") and ("o1"."invitedBy" = "o2"."id")) limit 1) desc',
			);
	});

	test('Relations nested in a many relation are aggregated', () => {
		expect(orderOf(db.query.users.findMany({
			orderBy: { posts: { comments: { likes: 'desc(avg)' }, author: { id: 'asc(min)' } } },
		}))).toStrictEqual(
			[
				'(select avg("o1"."likes") from "posts" as "o0" cross join "comments" as "o1" where (("d0"."id" = "o0"."authorId") and ("o0"."id" = "o1"."postId"))) desc',
				'(select min("o1"."id") from "posts" as "o0" cross join "users" as "o1" where (("d0"."id" = "o0"."authorId") and ("o0"."authorId" = "o1"."id"))) asc',
			].join(', '),
		);
	});

	test('Through relations and relations with filters', () => {
		const query = db.query.users.findMany({
			orderBy: {
				groups: { name: 'asc(min)' },
				topPosts: { id: 'desc(count)' },
				inviter: { groups: { id: 'asc(count)' } },
			},
		});

		expect(orderOf(query)).toStrictEqual(
			[
				'(select min("o0"."name") from "groups" as "o0" inner join "users_to_groups" as "ot0" on "ot0"."groupId" = "o0"."id" where "d0"."id" = "ot0"."userId") asc',
				'(select count("o0"."id") from "posts" as "o0" where (("d0"."id" = "o0"."authorId") and ("o0"."score" > $1))) desc',
				'(select count("o1"."id") from "users" as "o0" cross join "groups" as "o1" inner join "users_to_groups" as "ot1" on "ot1"."groupId" = "o1"."id" where (("d0"."invitedBy" = "o0"."id") and ("o0"."id" = "ot1"."userId"))) asc',
			].join(', '),
		);
		expect(query.toSQL().params).toStrictEqual([10]);
	});

	test('Stays in the limited table when relations are selected', () => {
		const order = '(select max("o0"."score") from "posts" as "o0" where "d0"."id" = "o0"."authorId") desc';
		const query = db.query.users.findMany({
			orderBy: { posts: { score: 'desc(max)' } },
			limit: 5,
			with: { posts: true },
		}).toSQL();

		expect(query.sql).toContain(
			`from (select "d0".* from "users" as "d0" order by ${order} limit $1) as "d0" left join`,
		);
		expect(query.sql.endsWith(`as "posts" on true order by ${order}`)).toStrictEqual(true);
	});

	test('Nested relation ordered by its own relation', () => {
		expect(
			db.query.posts.findMany({
				columns: { id: true },
				with: { comments: { columns: { id: true }, orderBy: { post: { author: { name: 'asc' } } } } },
			}).toSQL().sql,
		).toContain(
			'where "d0"."id" = "d1"."postId" order by (select "o1"."name" from "posts" as "o0" cross join "users" as "o1" where (("d1"."postId" = "o0"."id") and ("o0"."authorId" = "o1"."id")) limit 1) asc) as "t"',
		);
	});

	test('Skipped and empty orders', () => {
		expect(db.query.users.findMany({ orderBy: { posts: {}, inviter: undefined, id: undefined } }).toSQL().sql)
			.not.toContain('order by');
		expect(orderOf(db.query.users.findMany({ orderBy: { posts: { score: undefined }, id: 'asc' } })))
			.toStrictEqual('"d0"."id" asc');
	});

	test('Invalid orders throw', () => {
		const build = (orderBy: unknown) => () => db.query.users.findMany({ orderBy: orderBy as any }).toSQL();

		expect(build({ posts: { score: 'desc' } })).toThrowError(
			'Invalid order "posts.score": expected "asc(<aggregate>)" or "desc(<aggregate>)", with aggregate being one of: min, max, count, avg, first, got "desc"',
		);
		expect(build({ posts: { author: { name: 'asc' } } })).toThrowError('Invalid order "posts.author.name"');
		expect(build({ inviter: { name: 'asc(min)' } })).toThrowError(
			'Invalid order "inviter.name": expected "asc" or "desc", got "asc(min)"',
		);
		expect(build({ id: 'asc(count)' })).toThrowError('Invalid order "id": expected "asc" or "desc", got "asc(count)"');
		expect(build({ posts: { score: 'desc(sum)' } })).toThrowError(
			'Invalid order "posts.score": unknown aggregate "sum" in "desc(sum)", expected one of: min, max, count, avg, first',
		);
		expect(build({ posts: { score: 'desc()' } })).toThrowError('Invalid order "posts.score": unknown aggregate ""');
		expect(build({ id: 'ascending' })).toThrowError(
			'Invalid order "id": unknown direction "ascending" in "ascending", expected "asc" or "desc"',
		);
		expect(build({ posts: { score: 'DESC(max)' } })).toThrowError(
			'Invalid order "posts.score": unknown direction "DESC"',
		);
		expect(build({ posts: { score: '(max)' } })).toThrowError('Invalid order "posts.score": unknown direction ""');
		expect(build({ posts: { score: 'desc(max' } })).toThrowError(
			'Invalid order "posts.score": malformed value "desc(max", expected "desc" or "desc(<aggregate>)"',
		);
		expect(build({ posts: { score: 'desc(max)(min)' } })).toThrowError(
			'Invalid order "posts.score": malformed value',
		);
		expect(build({ id: 1 })).toThrowError('Invalid order "id": expected a string, got number');
		expect(build({ id: { nested: 'asc' } })).toThrowError('Invalid order "id": expected a string, got object');
		// aggregate's name is written into the query as is: nothing but a known one may get through
		expect(build({ posts: { score: 'desc(max) , (select 1)' } })).toThrowError(
			'Invalid order "posts.score": malformed value "desc(max) , (select 1)"',
		);
		expect(build({ posts: { score: 'desc(max) --)' } })).toThrowError(
			'Invalid order "posts.score": unknown aggregate "max) --"',
		);
		for (
			const malformed of [
				'desc(max',
				'desc(max))',
				'desc(max)(min)',
				'desc()',
				'(max)',
				'max',
				'DESC(max)',
				'desc (max)',
			]
		) {
			expect(build({ posts: { score: malformed } })).toThrowError('Invalid order "posts.score"');
			expect(build({ posts: malformed })).toThrowError('Invalid order "posts"');
		}
		for (const malformed of ['asc(', 'asc)', 'ascending']) {
			expect(build({ id: malformed })).toThrowError('Invalid order "id"');
		}
		expect(build({ inviter: 'asc' })).toThrowError(
			'Invalid order "inviter": expected an object with fields of relation to order by, got "asc"',
		);
		expect(build({ inviter: 'asc(count)' })).toThrowError(
			'Invalid order "inviter": expected an object with fields of relation to order by, got "asc(count)"',
		);
		expect(build({ posts: 'desc' })).toThrowError(
			'Invalid order "posts": expected an object with fields of relation to order by, "asc(count)" or "desc(count)", got "desc"',
		);
		expect(build({ posts: 'desc(max)' })).toThrowError('Invalid order "posts"');
		expect(build({ nope: { id: 'asc' } })).toThrowError('Unknown relational order field: "nope"');
	});

	test('Types', () => {
		db.query.users.findMany({ orderBy: { id: 'asc', inviter: { name: 'desc', inviter: { id: 'asc' } } } });
		db.query.users.findMany({ orderBy: { posts: { score: 'desc(max)', comments: { likes: 'asc(avg)' } } } });
		db.query.users.findMany({ orderBy: { inviter: { posts: { id: 'asc(count)', author: { name: 'desc(min)' } } } } });
		db.query.users.findMany({
			with: { posts: { orderBy: { author: { name: 'asc' }, comments: { id: 'desc(count)' } } } },
		});
		db.query.users.findMany({ orderBy: (t, { desc }) => desc(t.id) });

		db.query.users.findMany({ orderBy: { posts: { score: 'desc(first)', author: { name: 'asc(first)' } } } });

		db.query.users.findMany({ orderBy: { posts: 'desc(count)', inviter: { posts: 'asc(count)' } } });
		db.query.users.findMany({ orderBy: { posts: { comments: 'desc(count)' } } });
		// @ts-expect-error - single relations have no rows to count
		db.query.users.findMany({ orderBy: { inviter: 'asc(count)' } });
		// @ts-expect-error - relations are only ordered by the number of their rows
		db.query.users.findMany({ orderBy: { posts: 'desc(max)' } });
		// @ts-expect-error - direction is required
		db.query.users.findMany({ orderBy: { posts: 'count' } });

		// @ts-expect-error - fields of many relations have to be aggregated
		db.query.users.findMany({ orderBy: { posts: { score: 'desc' } } });

		db.query.users.findMany({ strategy: 'basic', with: { posts: true } });
		db.query.users.findFirst({ strategy: 'optimized' });
		// @ts-expect-error - unknown strategy
		db.query.users.findMany({ strategy: 'fast' });
		// @ts-expect-error - strategy is set for the whole query on its root level
		db.query.users.findMany({ with: { posts: { strategy: 'basic' } } });
		// @ts-expect-error - so do fields of relations nested in them
		db.query.users.findMany({ orderBy: { posts: { author: { name: 'asc' } } } });
		// @ts-expect-error - `first` is for many relations only
		db.query.users.findMany({ orderBy: { inviter: { name: 'asc(first)' } } });
		// @ts-expect-error - fields of single relations can't be aggregated
		db.query.users.findMany({ orderBy: { inviter: { name: 'asc(min)' } } });
		// @ts-expect-error - neither can own fields
		db.query.users.findMany({ orderBy: { id: 'asc(count)' } });
		// @ts-expect-error - unknown aggregate
		db.query.users.findMany({ orderBy: { posts: { score: 'desc(sum)' } } });
		// @ts-expect-error - relations are ordered by their fields
		db.query.users.findMany({ orderBy: { inviter: 'asc' } });
		// @ts-expect-error - unknown field of a relation
		db.query.users.findMany({ orderBy: { inviter: { nope: 'asc' } } });
	});
});
