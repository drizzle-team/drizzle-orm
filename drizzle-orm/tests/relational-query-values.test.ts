// The query a relational builder sends must be the query `toSQL()` shows, for every value, whatever the same
// database has run before. Each value takes a turn at being the first one a database sees, so anything kept from
// one query and used for the next (a cache of built queries, a reused chunk) shows up as a difference.
import * as Effect from 'effect/Effect';
import { describe, expect, test } from 'vitest';
import { EffectPostgresDatabase } from '~/effect-drizzle-postgres/driver.ts';
import { EffectPostgresSession } from '~/effect-drizzle-postgres/session.ts';
import { defineRelations, sql } from '~/index.ts';
import { drizzle as pgDrizzle } from '~/node-postgres/index.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import {
	bigint,
	boolean,
	customType,
	date,
	doublePrecision,
	integer,
	json,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from '~/pg-core/index.ts';
import { postgresCodecs } from '~/postgres/codecs.ts';
import { drizzle } from '~/postgres/index.ts';
import { createShapeGenerator } from '~/postgres/shape.ts';
import { operators } from '~/relations.ts';

const lower = customType<{ data: string }>({
	dataType: () => 'text',
	toDriver: (value) => (value.startsWith('raw:') ? sql`lower(${value.slice(4)})` : value),
});

const users = pgTable('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
	bio: text(),
	active: boolean().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	slug: lower(),
});
const posts = pgTable('posts', {
	id: integer().primaryKey(),
	authorId: integer('author_id').notNull(),
	title: text().notNull(),
	published: boolean().notNull(),
});
const comments = pgTable('comments', {
	id: integer().primaryKey(),
	postId: integer('post_id').notNull(),
	body: text(),
});

const relations = defineRelations({ users, posts, comments }, (r) => ({
	users: { posts: r.many.posts({ from: r.users.id, to: r.posts.authorId }) },
	posts: {
		author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
		comments: r.many.comments({ from: r.posts.id, to: r.comments.postId }),
	},
}));

type Prepared = { getQuery(): { sql: string; params: unknown[] }; shape: unknown; name?: string };
const prepared = (query: unknown) => (query as { _prepare(): Prepared })._prepare();
const built = (query: unknown) => (query as { toSQL(): { sql: string; params: unknown[] } }).toSQL();
const mock = () => drizzle.mock({ relations });

// Each entry builds the same shape from a different seed
const shapes: Record<string, (db: ReturnType<typeof mock>, i: number) => unknown> = {
	'no config': (db) => db.query.users.findMany(),
	'where by value': (db, i) => db.query.users.findMany({ where: { id: i } }),
	findFirst: (db, i) => db.query.users.findFirst({ where: { name: 'n' + i } }),
	operators: (db, i) =>
		db.query.users.findMany({
			where: { id: { gt: i, lte: i + 10 }, name: { like: `a${i}%` }, bio: { isNull: true }, active: true },
			columns: { id: true, name: true },
			orderBy: { id: 'desc' },
			limit: i + 1,
			offset: i,
		}),
	'OR / AND / NOT': (db, i) =>
		db.query.users.findMany({
			where: { OR: [{ id: i }, { AND: [{ name: 'x' + i }, { NOT: { active: false } }] }] },
		}),
	'in list': (db, i) => db.query.posts.findMany({ where: { id: { in: [i, i + 1, i + 2] } } }),
	date: (db, i) => db.query.users.findMany({ where: { createdAt: { gt: new Date(1e12 + i * 1000) } } }),
	'nested with': (db, i) =>
		db.query.users.findMany({
			where: { id: i },
			with: {
				posts: {
					where: { published: true, title: { ilike: `%${i}%` } },
					limit: 5,
					with: { comments: { limit: i + 2 }, author: { columns: { name: true } } },
				},
			},
			limit: 10,
		}),
	'filter on a relation': (db, i) => db.query.users.findMany({ where: { posts: { title: 't' + i } } }),
};

test.each(Object.keys(shapes))('%s: the cached query is the built query', (name) => {
	const db = mock();
	const make = shapes[name]!;
	for (const seed of [1, 2, 3, 40, 123456]) {
		const query = prepared(make(db, seed));
		expect(query.getQuery()).toEqual(built(make(db, seed)));
		// a builder that is run as it is stays unnamed
		expect(query.name).toBeUndefined();
	}
});

test('structure that changes the SQL gives another shape', () => {
	const db = mock();
	const run = (config: Parameters<typeof db.query.users.findMany>[0]) => {
		const query = () => db.query.users.findMany(config);
		prepared(query());
		expect(prepared(query()).getQuery()).toEqual(built(query()));
	};

	run({ where: { bio: 'a' } });
	run({ where: { bio: { isNull: true } } });
	run({ where: { bio: { isNotNull: true } } });
	run({ where: { active: true } });
	run({ where: { active: false } });
	run({ where: { id: { in: [1] } } });
	run({ where: { id: { in: [1, 2] } } });
	run({ where: { id: { in: [] } } });
	run({ orderBy: { id: 'asc' } });
	run({ orderBy: { id: 'desc' } });
	run({ columns: { id: true } });
	run({ columns: { id: false } });
	run({ limit: 1 });
	run({ limit: 1, offset: 1 });
});

test('a value of another JS type in the same place', () => {
	const db = mock();
	const byNumber = () => db.query.users.findMany({ where: { name: 1 as any } });
	const byString = () => db.query.users.findMany({ where: { name: 'a' } });
	for (const query of [byNumber, byString, byNumber, byString]) {
		expect(prepared(query()).getQuery()).toEqual(built(query()));
	}
});

test('findMany and findFirst, and two tables, do not share a shape', () => {
	const db = mock();
	for (
		const query of [() => db.query.users.findMany(), () => db.query.users.findFirst(), () => db.query.posts.findMany()]
	) {
		prepared(query());
		expect(prepared(query()).getQuery()).toEqual(built(query()));
	}
});

test('configs with SQL, callbacks and placeholders', () => {
	const db = mock();
	const queries = [
		(i: number) => db.query.users.findMany({ where: { RAW: (t) => sql`${t.id} = ${i}` } }),
		(i: number) => db.query.users.findMany({ extras: { n: sql<number>`${i}`.as('n') } }),
		(i: number) => db.query.users.findMany({ where: { id: sql.placeholder('id') }, limit: i }),
	];
	for (const make of queries) {
		for (const seed of [1, 2, 3]) {
			expect(prepared(make(seed)).getQuery()).toEqual(built(make(seed)));
		}
	}
});

test('a column that maps some values to SQL is never served a bound value in its place', () => {
	const db = mock();
	const make = (slug: string) => db.query.users.findMany({ where: { slug } });
	for (const slug of ['plain', 'raw:ABC', 'other', 'raw:DEF']) {
		const query = prepared(make(slug)).getQuery();
		expect(query).toEqual(built(make(slug)));
		expect(query.sql.includes('lower(')).toBe(slug.startsWith('raw:'));
	}

	// the same, when the first value seen is one that maps to SQL
	const fresh = mock();
	const makeFresh = (slug: string) => fresh.query.users.findMany({ where: { slug } });
	for (const slug of ['raw:ABC', 'plain', 'raw:DEF']) {
		expect(prepared(makeFresh(slug)).getQuery()).toEqual(built(makeFresh(slug)));
	}
});

test('`.prepare()` and `withCache`', () => {
	const db = mock();
	const named = (db.query.users.findMany({ where: { id: 1 } }) as any).prepare('mine');
	expect(named.name).toBe('mine');
	for (const id of [1, 2]) {
		const query = () => db.query.users.findMany({ where: { id }, withCache: true } as any);
		expect(prepared(query()).getQuery()).toEqual(built(query()));
	}
});

test('a query that is run is not given a statement name: only `.prepare()` names one', () => {
	const db = mock();
	const make = (i: number) => db.query.users.findMany({ where: { id: i }, with: { posts: true } });
	for (const seed of [1, 2, 3]) {
		const query = prepared(make(seed));
		expect(query.getQuery()).toEqual(built(make(seed)));
		expect(query.name).toBeUndefined();
	}
	expect((make(4) as any).prepare().name).toBeTypeOf('string');
});

test('another driver', () => {
	const db = pgDrizzle.mock({ relations });
	const make = (i: number) => db.query.users.findMany({ where: { id: i }, with: { posts: true } });
	for (const seed of [1, 2, 3]) expect(prepared(make(seed)).getQuery()).toEqual(built(make(seed)));
});

// Every operator that takes a value, against every kind of column, in every place a filter can sit. A value that
// is kept from one query shows only on a later query of the same shape with another value, so each value takes a
// turn at being the one the shape is first seen with
const mood = pgEnum('mood', ['sad', 'ok', 'happy']);
const kinds = pgTable('kinds', {
	id: integer().primaryKey(),
	parentId: integer('parent_id'),
	int: integer(),
	big: bigint({ mode: 'bigint' }),
	bigNumber: bigint('big_number', { mode: 'number' }),
	num: numeric(),
	numNumber: numeric('num_number', { mode: 'number' }),
	real: doublePrecision(),
	txt: text(),
	vc: varchar({ length: 20 }),
	bool: boolean(),
	ts: timestamp({ withTimezone: true }),
	tsString: timestamp('ts_string', { mode: 'string' }),
	day: date({ mode: 'date' }),
	dayString: date('day_string'),
	uid: uuid(),
	mood: mood(),
	js: json(),
	jsb: jsonb(),
	tags: text().array(),
	ints: integer().array(),
	grid: integer().array().array(),
	custom: lower(),
});
const kindsRelations = defineRelations({ kinds }, (r) => ({
	kinds: {
		parent: r.one.kinds({ from: r.kinds.parentId, to: r.kinds.id }),
		children: r.many.kinds({ from: r.kinds.id, to: r.kinds.parentId }),
	},
}));

const kindValues: Record<string, unknown[]> = {
	int: [1, 2, 0, -7],
	big: [1n, 2n, -(2n ** 62n)],
	bigNumber: [1, 2, 2 ** 40],
	num: ['1.5', '2.25', '0'],
	numNumber: [1.5, 2.25, 0],
	real: [1.5, 2.25, -0.5],
	txt: ['a', 'b', '', "o'x", '$1'],
	vc: ['a', 'b', ''],
	bool: [true, false],
	ts: [new Date(1e12), new Date(2e12), new Date(0)],
	tsString: ['2020-01-01 00:00:00', '2021-06-01 12:00:00'],
	day: [new Date(1e12), new Date(2e12)],
	dayString: ['2020-01-01', '2021-06-01'],
	uid: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
	mood: ['sad', 'ok', 'happy'],
	js: [{ a: 1 }, { a: 2 }, { b: 'x' }, [1, 2], [3, 4], 'str', 5, { a: { b: [1] } }, { a: { b: [2] } }],
	jsb: [{ a: 1 }, { a: 2 }, { b: 'x' }, [1, 2], [3, 4], 'str', 5, { a: { b: [1] } }, { a: { b: [2] } }],
	tags: [['a'], ['b'], ['a', 'b'], ['c', 'd'], []],
	ints: [[1], [2], [1, 2], [3, 4], []],
	grid: [[[1, 2]], [[3, 4]], [[1], [2]], [[5], [6]]],
	custom: ['plain', 'other', 'raw:ABC', 'raw:DEF'],
};

// Operators that take one value, and the two that take a list of them
const valueOperators = [
	'eq',
	'ne',
	'gt',
	'gte',
	'lt',
	'lte',
	'like',
	'ilike',
	'notLike',
	'notIlike',
	'arrayContains',
	'arrayContained',
	'arrayOverlaps',
] as const;
const listOperators = ['in', 'notIn'] as const;

type KindsDb = ReturnType<typeof kindsMock>;
const kindsMock = () => drizzle.mock({ relations: kindsRelations });
const find = (db: KindsDb, config: unknown) => db.query.kinds.findMany(config as any);

// Where a filter on a column can sit in a config
const places: Record<string, (filter: Record<string, unknown>) => unknown> = {
	where: (filter) => ({ where: filter }),
	'where, with other params around': (filter) => ({ where: { id: 3, ...filter, parentId: { gt: 4 } }, limit: 5 }),
	OR: (filter) => ({ where: { OR: [{ id: 1 }, filter] } }),
	'AND in NOT': (filter) => ({ where: { NOT: { AND: [filter, { id: { ne: 2 } }] } } }),
	'where of a relation': (filter) => ({ with: { children: { where: filter, limit: 2 } } }),
	'filter on a relation': (filter) => ({ where: { parent: filter } }),
};

/** The query that is run is the built query. A config the builder refuses is refused when run too */
function expectCachedIsBuilt(db: KindsDb, config: unknown, label: string) {
	let expected: unknown;
	try {
		expected = built(find(db, config));
	} catch {
		expect(() => prepared(find(db, config)), label).toThrow();
		return;
	}
	expect(prepared(find(db, config)).getQuery(), label).toEqual(expected);
}

/** Runs `filterOf` over the values with each of them first, on a database that has not seen the shape */
function everyValueFirst(place: string, values: unknown[], filterOf: (value: unknown) => Record<string, unknown>) {
	for (let first = 0; first < values.length; ++first) {
		const db = kindsMock();
		for (const value of [values[first], ...values, values[first]]) {
			expectCachedIsBuilt(
				db,
				places[place]!(filterOf(value)),
				`${place}, first ${show(values[first])}, then ${show(value)}`,
			);
		}
	}
}

const show = (value: unknown) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));

test('the operator matrix covers every operator a filter can use', () => {
	// Not values of a column: logic, existence, null checks and raw SQL
	const structural = ['and', 'or', 'not', 'exists', 'notExists', 'isNull', 'isNotNull', 'sql', 'between', 'notBetween'];
	const renamed: Record<string, string> = { inArray: 'in', notInArray: 'notIn' };
	const covered = new Set<string>([...valueOperators, ...listOperators]);
	const missing = Object.keys(operators)
		.filter((name) => !structural.includes(name))
		.map((name) => renamed[name] ?? name)
		.filter((name) => !covered.has(name));
	expect(missing).toEqual([]);
});

describe.each(Object.keys(kindValues))('column %s: the cached query is the built query', (column) => {
	const values = kindValues[column]!;

	test.each(Object.keys(places))('a bare value, %s', (place) => {
		// A bare object is read as operators, so it is not a value here
		const bare = values.filter((value) => typeof value !== 'object' || value instanceof Date);
		if (bare.length) everyValueFirst(place, bare, (value) => ({ [column]: value }));
	});

	test.each(valueOperators.flatMap((operator) => Object.keys(places).map((place) => [operator, place] as const)))(
		'%s, %s',
		(operator, place) => {
			everyValueFirst(place, values, (value) => ({ [column]: { [operator]: value } }));
		},
	);

	test.each(listOperators.flatMap((operator) => Object.keys(places).map((place) => [operator, place] as const)))(
		'%s, %s',
		(operator, place) => {
			// Lists of the same length, so they share a shape, and one of another length
			const lists = [...values.map((value, i) => [value, values[(i + 1) % values.length]]), [values[0]]];
			everyValueFirst(place, lists, (list) => ({ [column]: { [operator]: list } }));
		},
	);

	test('two operators on one column, and two columns', () => {
		const pairs = values.map((value, i) => [value, values[(i + 1) % values.length]]);
		everyValueFirst('where', pairs, (pair) => {
			const [a, b] = pair as unknown[];
			return { [column]: { eq: a, ne: b }, id: { in: [1, 2] } };
		});
	});
});

test('a value that differs only deep inside an array or an object is not served from an earlier query', () => {
	const db = kindsMock();
	const params = (config: unknown) => prepared(find(db, config)).getQuery().params;

	for (const column of ['tags', 'ints', 'grid', 'js', 'jsb']) {
		const [a, b] = kindValues[column]!;
		const first = params({ where: { [column]: { eq: a } } });
		const second = params({ where: { [column]: { eq: b } } });
		expect(second, column).not.toEqual(first);
		expect(second, column).toEqual(built(find(db, { where: { [column]: { eq: b } } })).params);
	}
});

test('array and JSON values, whatever is inside them', () => {
	const db = kindsMock();
	const cases: [string, string, unknown[]][] = [
		['tags', 'arrayContains', [['a'], ['b', 'c'], new Array(500).fill(0).map((_, i) => 't' + i)]],
		['ints', 'arrayOverlaps', [[1], [2, 3, 4]]],
		['grid', 'eq', [[[1, 2]], [[3], [4]], [[5, 6, 7]]]],
		['jsb', 'eq', [{ a: 1 }, { b: { c: [1, 2, 3] } }, { d: 'x', e: null }]],
		['js', 'ne', [{ a: 1 }, { z: [{ y: 1 }] }]],
	];

	for (const [column, operator, values] of cases) {
		for (const value of [...values, ...values]) {
			const config = { where: { [column]: { [operator]: value }, id: 1 } };
			expect(prepared(find(db, config)).getQuery(), `${column} ${show(value)}`).toEqual(built(find(db, config)));
		}
	}
});

test('lists of every length, short and long', () => {
	const db = kindsMock();
	const ids = (length: number) => new Array(length).fill(0).map((_, i) => i);

	const huge = { where: { id: { in: ids(40_000) } } };
	expect(prepared(find(db, huge)).getQuery()).toEqual(built(find(db, huge)));
	for (let length = 1; length <= 300; ++length) {
		const config = { where: { id: { in: ids(length) } } };
		expect(prepared(find(db, config)).getQuery().params).toEqual(ids(length));
	}

	// a query seen after all of that
	prepared(find(db, { where: { txt: 'a' } }));
	expect(prepared(find(db, { where: { txt: 'b' } })).getQuery().params).toEqual(['b']);
});

test('one place holding a value in one query and operators or a list in another, in any order', () => {
	// What sits after a column key, an operator or inside a list can be an array value, a JSON value, an operators
	// object or a list, depending on the column and the query. Whatever is kept from one must not be applied to
	// another
	const forms: ((seed: number) => unknown)[] = [
		(i) => ({ where: { tags: ['bare' + i] } }),
		(i) => ({ where: { tags: { arrayContains: ['x' + i, 'y'] } } }),
		(i) => ({ where: { tags: { eq: ['e' + i] } } }),
		(i) => ({ where: { tags: { in: [['a' + i], ['b']] } } }),
		(i) => ({ where: { tags: { in: [['a' + i, 'c'], ['b']] } } }),
		(i) => ({ where: { ints: [i, i + 1] } }),
		(i) => ({ where: { ints: { eq: [i], ne: [i + 1, i + 2] } } }),
		(i) => ({ where: { jsb: { eq: { a: i } } } }),
		(i) => ({ where: { jsb: { eq: [i, { a: i }] } } }),
		(i) => ({ where: { jsb: { eq: 'str' + i } } }),
		(i) => ({ where: { jsb: { in: [{ a: i }, { b: i }] } } }),
		(i) => ({ where: { jsb: { in: [[i], [i, i]] } } }),
		(i) => ({ where: { jsb: { ne: { eq: i } } } }),
		(i) => ({ where: { js: { eq: { in: [i] } }, id: { in: [i] } } }),
		(i) => ({ where: { OR: [{ jsb: { eq: { OR: [i] } } }, { tags: { arrayOverlaps: ['o' + i] } }] } }),
		(i) => ({ where: { parent: { jsb: { eq: { a: i } }, tags: ['p' + i] } } }),
	];

	const orders = [forms, [...forms].reverse(), forms.map((_, i) => forms[(i * 7 + 3) % forms.length]!)];
	for (const order of orders) {
		const db = kindsMock();
		for (let round = 0; round < 4; ++round) {
			for (const form of order) {
				for (const seed of [round, round + 10]) {
					expectCachedIsBuilt(db, form(seed), `round ${round}: ${show(form(seed))}`);
				}
			}
		}
	}
});

test('a query reports the tables it uses, each time it is run', () => {
	const tables = (db: ReturnType<typeof mock>, i: number) => {
		const query = db.query.users.findMany({ where: { id: i }, with: { posts: { with: { comments: true } } } });
		return (prepared(query) as any).queryMetadata.tables().sort();
	};
	const db = mock();
	const first = tables(db, 1);
	expect(first).toEqual(['comments', 'posts', 'users']);
	expect(tables(db, 2)).toEqual(first);
});

// What a column's `toDriver` gives can depend on the value, so each kind of value takes a turn at being first
const sqlForSome = customType<{ data: string }>({
	dataType: () => 'text',
	// SQL around the value itself, for some values only
	toDriver: (value) => (value === value.toUpperCase() ? sql`lower(${value})` : value),
});
const sqlAlways = customType<{ data: string }>({
	dataType: () => 'text',
	toDriver: (value) => sql`lower(${value})`,
});
const typeForSome = customType<{ data: string | number }>({
	dataType: () => 'text',
	toDriver: (value) => (typeof value === 'string' && value.startsWith('n') ? Number(value.slice(1)) : value),
});
const paramsForSome = customType<{ data: string }>({
	dataType: () => 'text',
	// two params from one value, for some values only
	toDriver: (value) => (value.length > 3 ? sql`concat(${value.slice(0, 1)}, ${value.slice(1)})` : value),
});
const nullForSome = customType<{ data: string }>({
	dataType: () => 'text',
	toDriver: (value) => (value === '' ? (null as any) : value),
});
const drivers = pgTable('drivers', {
	id: integer().primaryKey(),
	sqlForSome: sqlForSome('sql_for_some'),
	sqlAlways: sqlAlways('sql_always'),
	typeForSome: typeForSome('type_for_some'),
	paramsForSome: paramsForSome('params_for_some'),
	nullForSome: nullForSome('null_for_some'),
});
const driversRelations = defineRelations({ drivers });

describe.each<[string, unknown[]]>([
	['sqlForSome', ['ABC', 'plain', 'DEF', 'other']],
	['sqlAlways', ['ABC', 'plain']],
	['typeForSome', ['n1', 'plain', 'n2', 5]],
	['paramsForSome', ['ab', 'abcdef', 'xy', 'uvwxyz']],
	['nullForSome', ['a', '', 'b']],
])('a column whose toDriver depends on the value: %s', (column, values) => {
	test.each(values.map((value, i) => [show(value), i] as const))('first seen with %s', (_, first) => {
		const db = drizzle.mock({ relations: driversRelations });
		for (const value of [values[first], ...values, values[first]]) {
			for (
				const where of [{ [column]: value, id: 1 }, { [column]: { ne: value } }, { [column]: { in: [value, value] } }]
			) {
				const query = () => db.query.drivers.findMany({ where } as any);
				expect(prepared(query()).getQuery(), `first ${show(values[first])}, then ${show(where)}`)
					.toEqual(built(query()));
			}
		}
	});
});

// Outside the declared types, but a value the builder reads instead of binding must not be served from another's query
describe('a value that decides the query instead of being bound', () => {
	const cases: Record<string, unknown[]> = {
		'isNull by number': [1, 0, 2, 0].map((v) => ({ where: { bio: { isNull: v } } })),
		'isNull by string': ['x', '', 'y'].map((v) => ({ where: { bio: { isNull: v } } })),
		'isNotNull by number, among params': [1, 0, 2, 0].map((v) => ({
			where: { id: { gt: 3 }, bio: { isNotNull: v }, name: 'a' },
			limit: 4,
		})),
		'a relation by number': [1, 0, 2].map((v) => ({ where: { posts: v } })),
		'a date under a column': [new Date(1e12), new Date(2e12)].map((v) => ({ where: { createdAt: v } })),
		'limit and offset': [0, 5, -1, Number.NaN, 0, 1.5].map((v) => ({ limit: v, offset: v })),
		'limit and offset of a relation': [0, 5, 0].map((v) => ({ with: { posts: { limit: v, offset: v } } })),
	};

	test.each(Object.keys(cases))('%s', (name) => {
		const configs = cases[name]!;
		for (let first = 0; first < configs.length; ++first) {
			const db = mock();
			for (const config of [configs[first], ...configs, configs[first]]) {
				const make = () => db.query.users.findMany(config as any);
				let expected: unknown;
				try {
					expected = built(make());
				} catch {
					expect(() => prepared(make()), show(config)).toThrow();
					continue;
				}
				expect(prepared(make()).getQuery(), `first #${first}, then ${show(config)}`).toEqual(expected);
			}
		}
	});
});

test('values at the edge of their type', () => {
	const edges: Record<string, unknown[]> = {
		int: [1, 0, -0, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, 1.5, 1e21],
		big: [1n, 0n, 2n ** 63n - 1n, -(2n ** 63n)],
		real: [1.5, Number.NaN, Number.NEGATIVE_INFINITY, Number.MIN_VALUE, -0],
		txt: ['a', '', ' ', '\0', '$1', '?', "'; drop table kinds; --", 'x'.repeat(10_000), '\u{1F600}'],
		ts: [new Date(1e12), new Date(0), new Date(-1), new Date(8.64e15), new Date(Number.NaN)],
		day: [new Date(1e12), new Date(Number.NaN)],
		jsb: [{ a: 1 }, {}, [], '', 0, { '': null }, { a: undefined }, [null], [[]], { a: new Date(0) }],
		tags: [['a'], [''], ['a', null], [null]],
		grid: [[[1]], [[]], [[1], [2, 3]]],
	};
	for (const [column, values] of Object.entries(edges)) {
		everyValueFirst('where', values, (value) => ({ [column]: { eq: value } }));
		everyValueFirst('where', values, (value) => ({ [column]: { in: [value, values[0]] } }));
	}
});

test('JSON arrays that differ in what they hold', () => {
	const db = kindsMock();
	for (let length = 1; length <= 30; ++length) {
		const value = new Array(length).fill(0).map((_, i) => (i % 2 ? 'a' : i));
		for (let run = 0; run < 2; ++run) expectCachedIsBuilt(db, { where: { jsb: { eq: value } } }, show(value));
	}
});

test('the order of keys in a config does not change what is served', () => {
	const db = kindsMock();
	const orders: ((i: number) => unknown)[] = [
		(i) => ({ where: { int: i, txt: 't' + i }, limit: i + 1, orderBy: { id: 'asc' } }),
		(i) => ({ orderBy: { id: 'asc' }, limit: i + 1, where: { txt: 't' + i, int: i } }),
		(i) => ({ limit: i + 1, where: { txt: 't' + i, int: i }, orderBy: { id: 'asc' } }),
		(i) => ({ where: { int: { gt: i, lt: i + 5 }, txt: 't' + i } }),
		(i) => ({ where: { txt: 't' + i, int: { lt: i + 5, gt: i } } }),
	];
	for (let round = 0; round < 3; ++round) {
		for (const order of orders) expectCachedIsBuilt(db, order(round), show(order(round)));
	}
});

test('random configs: the cached query is the built query', () => {
	// mulberry32
	const random = (seed: number) => () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const columns = Object.keys(kindValues);

	/** A config whose structure comes from `structure` alone, and whose values also from `values` */
	const config = (structure: number, values: number): unknown => {
		const next = random(structure);
		const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
		const chance = (p: number) => next() < p;
		let taken = values;
		const value = (column: string) => {
			const list = kindValues[column]!;
			return list[taken++ % list.length];
		};

		const field = (): Record<string, unknown> => {
			const column = pick(columns);
			const kind = next();
			if (kind < 0.15) return { [column]: { isNull: chance(0.5) } };
			if (kind < 0.25) return { [column]: { isNotNull: true } };
			if (kind < 0.4) {
				const length = 1 + Math.floor(next() * 3);
				return { [column]: { [pick(listOperators)]: new Array(length).fill(0).map(() => value(column)) } };
			}
			const filter: Record<string, unknown> = { [pick(valueOperators)]: value(column) };
			if (chance(0.3)) filter[pick(valueOperators)] = value(column);
			return { [column]: filter };
		};
		const filter = (depth: number): Record<string, unknown> => {
			const out: Record<string, unknown> = {};
			const entries = 1 + Math.floor(next() * 3);
			for (let i = 0; i < entries; ++i) {
				const kind = depth > 2 ? 0 : next();
				if (kind < 0.6) Object.assign(out, field());
				else if (kind < 0.75) out[pick(['OR', 'AND'])] = [filter(depth + 1), filter(depth + 1)];
				else if (kind < 0.85) out['NOT'] = filter(depth + 1);
				else out[pick(['parent', 'children'])] = chance(0.2) ? true : filter(depth + 1);
			}
			return out;
		};
		const query = (depth: number, many: boolean): Record<string, unknown> => {
			const out: Record<string, unknown> = {};
			if (chance(0.7)) out['where'] = filter(0);
			if (chance(0.3)) {
				const keep = chance(0.7);
				out['columns'] = Object.fromEntries([pick(columns), pick(columns), 'id'].map((column) => [column, keep]));
			}
			if (many && chance(0.3)) out['orderBy'] = { [pick(columns)]: pick(['asc', 'desc']) };
			if (many && chance(0.4)) out['limit'] = (taken++ % 7) + 1;
			if (many && chance(0.2)) out['offset'] = taken++ % 5;
			if (depth < 2 && chance(0.4)) {
				const relations: Record<string, unknown> = {};
				if (chance(0.6)) relations['children'] = chance(0.3) ? true : query(depth + 1, true);
				if (chance(0.5)) relations['parent'] = chance(0.3) ? true : query(depth + 1, false);
				out['with'] = relations;
			}
			return out;
		};
		return query(0, true);
	};

	// One database for all of them, so that whatever one config leaves behind is there for the next
	const db = kindsMock();
	let builds = 0;
	for (let structure = 0; structure < 400; ++structure) {
		for (const values of [0, 1, 2, 0]) {
			const made = config(structure, values);
			try {
				built(find(db, made));
				++builds;
			} catch {
				// a config the builder refuses: checked to be refused when run too
			}
			expectCachedIsBuilt(db, made, `structure ${structure}, values ${values}: ${show(made)}`);
		}
	}
	// the generator makes configs that build
	expect(builds).toBeGreaterThan(1200);
});

test('the Effect builder sends the same query, and does not name its statements', () => {
	const dialect = new PgDialect({ codecs: postgresCodecs, shapeGenerator: createShapeGenerator(postgresCodecs) });
	const sent: { sql: string; params: unknown[]; name: string | undefined }[] = [];
	const client = {
		query: (text: string, params: unknown[], options: { name?: string }) => {
			sent.push({ sql: text, params, name: options.name });
			return Effect.succeed({ rows: [] });
		},
	};
	const session = new EffectPostgresSession(client as any, dialect, kindsRelations, {
		logger: { logQuery: () => Effect.void } as any,
		cache: undefined as any,
	});
	const effectDb = new EffectPostgresDatabase(dialect, session, kindsRelations);
	const asyncDb = kindsMock();

	const configs = (i: number): unknown[] => [
		{ where: { int: i, txt: { like: `a${i}%` } }, limit: i + 1 },
		{ where: { tags: { arrayContains: ['t' + i] } }, with: { children: { where: { jsb: { eq: { a: i } } } } } },
		{ where: { OR: [{ id: { in: [i, i + 1] } }, { parent: { txt: 'p' + i } }] } },
	];
	for (const seed of [1, 2, 3]) {
		for (const config of configs(seed)) {
			Effect.runSync(effectDb.query.kinds.findMany(config as any) as any);
			const expected = prepared(find(asyncDb, config));
			const last = sent.at(-1)!;
			expect({ sql: last.sql, params: last.params }, show(config)).toEqual(expected.getQuery());
			expect(last.name, show(config)).toBeUndefined();
		}
	}
});
