import { expect, test } from 'vitest';
import { drizzle } from '~/node-postgres';
import { integer, pgTable, serial, text } from '~/pg-core';
import { eq, sql } from '~/sql';
import { makeDefaultQueryMapper, makeJitQueryMapper } from '~/utils.ts';

const db = drizzle.mock();

const cities = pgTable('cities_jm', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	state: text('state'),
	zip: text('zip'),
});

const users = pgTable('users_jm', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	bio: text('bio'),
	cityId: integer('city_id'),
});

const leftJoined = (qb: any) => qb.leftJoin(cities, eq(users.cityId, cities.id));

function compareToDefault(qb: any, rows: unknown[][]) {
	const fields = qb._resolveSelection();
	const expected = makeDefaultQueryMapper(fields, qb.joinsNotNullableMap)(rows);
	expect(makeJitQueryMapper(fields, qb.joinsNotNullableMap)(rows)).toEqual(expected);
	return expected;
}

test('No source table group nullification', () => {
	const res = compareToDefault(db.select({ id: users.id, meta: { bio: users.bio, city: users.name } }).from(users), [[
		1,
		null,
		null,
	]]);
	expect(res).toEqual([{ id: 1, meta: { bio: null, city: null } }]);
});

test('No cross-table group nullification', () => {
	const notNullFirst = compareToDefault(
		leftJoined(db.select({ id: users.id, g: { user: users.name, cityId: cities.id } }).from(users)),
		[[2, 'Jane', null]],
	);
	expect(notNullFirst).toEqual([{ id: 2, g: { user: 'Jane', cityId: null } }]);

	const nullableFirst = compareToDefault(
		leftJoined(db.select({ id: users.id, g: { bio: users.bio, cityId: cities.id } }).from(users)),
		[[2, null, null]],
	);
	expect(nullableFirst).toEqual([{ id: 2, g: { bio: null, cityId: null } }]);
});

test('No SQL field group nullification', () => {
	const res = compareToDefault(leftJoined(db.select({ id: users.id, calc: { u: sql`1`, c: sql`2` } }).from(users)), [[
		2,
		'JANE',
		null,
	]]);
	expect(res).toEqual([{ id: 2, calc: { u: 'JANE', c: null } }]);
});

test('Nullable join group nullification', () => {
	const res = compareToDefault(
		leftJoined(db.select({ n: users.name, c: { state: cities.state, zip: cities.zip } }).from(users)),
		[['John', 'IDF', '75'], ['Jane', null, null]],
	);
	expect(res).toEqual([{ n: 'John', c: { state: 'IDF', zip: '75' } }, { n: 'Jane', c: null }]);
});

test('No nullification with non-null result from SQL field in group', () => {
	const res = compareToDefault(
		leftJoined(db.select({ n: users.name, c: { state: cities.state, up: sql`3` } }).from(users)),
		[['Jane', null, 'LONDON']],
	);
	expect(res).toEqual([{ n: 'Jane', c: { state: null, up: 'LONDON' } }]);
});

test('nullifies a top-level object nested more than one Collect level deep', () => {
	const res = compareToDefault(
		leftJoined(db.select({ n: users.name, c: { inner: { state: cities.state, zip: cities.zip } } } as any).from(users)),
		[['John', 'IDF', '75'], ['Jane', null, null]],
	);
	expect(res).toEqual([
		{ n: 'John', c: { inner: { state: 'IDF', zip: '75' } } },
		{ n: 'Jane', c: null },
	]);
});

test('No nullification without `joinsNotNullableMap`', () => {
	const qb: any = db.select({ id: users.id, g: { bio: users.bio } }).from(users);
	const fields = qb._resolveSelection();

	expect(makeJitQueryMapper(fields, undefined)([[1, null]])).toEqual([{ id: 1, g: { bio: null } }]);
	expect(makeDefaultQueryMapper(fields, undefined)([[1, null]])).toEqual([{ id: 1, g: { bio: null } }]);
});
