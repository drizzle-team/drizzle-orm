import Database from 'better-sqlite3';
import { describe, it } from 'vitest';
import { betterSQLite3Codecs, drizzle } from '~/better-sqlite3';
import { asc, eq, sql } from '~/sql';
import { alias, camelCase, castToText, integer, text, union } from '~/sqlite-core';

const users = camelCase.table('users', {
	id: integer().primaryKey({ autoIncrement: true }),
	first_name: text().notNull(),
	last_name: text().notNull(),
	// Test that custom aliases remain
	age: integer('AGE'),
});

const developers = camelCase.table('developers', {
	user_id: integer().primaryKey().references(() => users.id),
	uses_drizzle_orm: integer({ mode: 'boolean' }).notNull(),
});

const devs = alias(developers, 'devs');

const db = drizzle({ client: new Database(':memory:') });

const fullName = sql`${users.first_name} || ' ' || ${users.last_name}`.as('name');

describe('sqlite to camel case', () => {
	it('unicode column names', ({ expect }) => {
		const unicode = camelCase.table('unicode', {
			칼럼명: text(),
		});

		expect(db.select().from(unicode).toSQL().sql).toEqual(
			'select "칼럼명" from "unicode"',
		);
	});

	it('qualifier preservation for sql fields', ({ expect }) => {
		const a = camelCase.table('a', { id: integer('id').primaryKey(), cId: integer().notNull() });
		const b = camelCase.table('b', { id: integer('id').primaryKey(), cId: integer().notNull(), label: text() });
		const corr = sql`(select ${b.label} from ${b} where ${b.cId} = ${a.cId})`;

		expect(db.select({ id: a.id, bRaw: corr }).from(a).toSQL().sql).toEqual(
			'select "id", (select "b"."label" from "b" where "b"."cId" = "a"."cId") from "a"',
		);
		expect(db.select({ id: a.id, bRaw: corr.as('b_raw') }).from(a).toSQL().sql).toEqual(
			'select "id", (select "b"."label" from "b" where "b"."cId" = "a"."cId") as "b_raw" from "a"',
		);
		expect(db.select({ id: a.id }).from(a).where(corr).toSQL().sql).toEqual(
			'select "id" from "a" where (select "b"."label" from "b" where "b"."cId" = "a"."cId")',
		);
	});

	it('qualifier preservation for subquery fields', ({ expect }) => {
		const sq = db.select({ id: users.id, name: fullName }).from(users).as('sq');
		const query = db
			.select({ id: sq.id, name: sq.name })
			.from(users)
			.leftJoin(sq, eq(users.id, sq.id));

		expect(query.toSQL()).toEqual({
			sql:
				'select "sq"."id", "sq"."name" from "users" left join (select "id", "firstName" || \' \' || "lastName" as "name" from "users") "sq" on "users"."id" = "sq"."id"',
			params: [],
		});
	});

	it('select', ({ expect }) => {
		const query = db
			.select({ name: fullName, age: users.age })
			.from(users)
			.leftJoin(developers, eq(users.id, developers.user_id))
			.orderBy(asc(users.first_name));

		expect(query.toSQL()).toEqual({
			sql:
				'select "users"."firstName" || \' \' || "users"."lastName" as "name", "users"."AGE" from "users" left join "developers" on "users"."id" = "developers"."userId" order by "users"."firstName" asc',
			params: [],
		});
	});

	it('select (with alias)', ({ expect }) => {
		const query = db
			.select({ first_name: users.first_name })
			.from(users)
			.leftJoin(devs, eq(users.id, devs.user_id));

		expect(query.toSQL()).toEqual({
			sql: 'select "users"."firstName" from "users" left join "developers" "devs" on "users"."id" = "devs"."userId"',
			params: [],
		});
	});

	it('with CTE', ({ expect }) => {
		const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: 'with "cte" as (select "firstName" || \' \' || "lastName" as "name" from "users") select "name" from "cte"',
			params: [],
		});
	});

	it('with CTE (with query builder)', ({ expect }) => {
		const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: 'with "cte" as (select "firstName" || \' \' || "lastName" as "name" from "users") select "name" from "cte"',
			params: [],
		});
	});

	it('set operator', ({ expect }) => {
		const query = db
			.select({ first_name: users.first_name })
			.from(users)
			.union(db.select({ first_name: users.first_name }).from(users));

		expect(query.toSQL()).toEqual({
			sql:
				'select "firstName" from (select "firstName" from "users" union select "firstName" from "users") "drizzle_union"',
			params: [],
		});
	});

	it('set operator (function)', ({ expect }) => {
		const query = union(
			db.select({ first_name: users.first_name }).from(users),
			db.select({ first_name: users.first_name }).from(users),
		);

		expect(query.toSQL()).toEqual({
			sql:
				'select "firstName" from (select "firstName" from "users" union select "firstName" from "users") "drizzle_union"',
			params: [],
		});
	});

	it('insert (on conflict do nothing)', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ first_name: 'John', last_name: 'Doe', age: 30 })
			.onConflictDoNothing({ target: users.first_name })
			.returning({ first_name: users.first_name, age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("id", "firstName", "lastName", "AGE") values (null, ?, ?, ?) on conflict ("users"."firstName") do nothing returning "firstName", "AGE"',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (on conflict do update)', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ first_name: 'John', last_name: 'Doe', age: 30 })
			.onConflictDoUpdate({ target: users.first_name, set: { age: 31 } })
			.returning({ first_name: users.first_name, age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("id", "firstName", "lastName", "AGE") values (null, ?, ?, ?) on conflict ("users"."firstName") do update set "AGE" = ? returning "firstName", "AGE"',
			params: ['John', 'Doe', 30, 31],
		});
	});

	it('insert (column selection)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 })
			.returning({ first_name: users.first_name, age: users.age });

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("firstName", "lastName", "AGE") values (?, ?, ?) returning "firstName", "AGE"',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (column selection, multiple rows)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name')
			.values([{ first_name: 'John', last_name: 'Doe' }, { first_name: 'Jane', last_name: 'Roe' }]);

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("firstName", "lastName") values (?, ?), (?, ?)',
			params: ['John', 'Doe', 'Jane', 'Roe'],
		});
	});

	it('insert (column selection, omitted optional column)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe' });

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("firstName", "lastName", "AGE") values (?, ?, null)',
			params: ['John', 'Doe'],
		});
	});

	it('insert (column selection) with select', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name')
			.select(db.select({ first_name: users.first_name, last_name: users.last_name }).from(users));

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("firstName", "lastName") select "firstName", "lastName" from "users"',
			params: [],
		});
	});

	it('insert (column selection) emits columns in list order', ({ expect }) => {
		const query = db
			.insert(users, 'age', 'last_name', 'first_name')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("AGE", "lastName", "firstName") values (?, ?, ?)',
			params: [30, 'Doe', 'John'],
		});
	});

	it('insert (column selection) on conflict do update', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 })
			.onConflictDoUpdate({ target: users.first_name, set: { age: 31 } })
			.returning({ first_name: users.first_name, age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("firstName", "lastName", "AGE") values (?, ?, ?) on conflict ("users"."firstName") do update set "AGE" = ? returning "firstName", "AGE"',
			params: ['John', 'Doe', 30, 31],
		});
	});

	it('update', ({ expect }) => {
		const query = db
			.update(users)
			.set({ first_name: 'John', last_name: 'Doe', age: 30 })
			.where(eq(users.id, 1))
			.returning({ first_name: users.first_name, age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'update "users" set "firstName" = ?, "lastName" = ?, "AGE" = ? where "users"."id" = ? returning "firstName", "AGE"',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1))
			.returning({ first_name: users.first_name, age: users.age });

		expect(query.toSQL()).toEqual({
			sql: 'delete from "users" where "users"."id" = ? returning "firstName", "AGE"',
			params: [1],
		});
	});

	it('select columns as', ({ expect }) => {
		const query = db
			.select({ age: users.age.as('ageOfUser'), id: users.id.as('userId') })
			.from(users)
			.orderBy(asc(users.id.as('userId')));

		expect(query.toSQL()).toEqual({
			sql: 'select "AGE" as "ageOfUser", "id" as "userId" from "users" order by "userId" asc',
			params: [],
		});
	});

	it('select join columns as', ({ expect }) => {
		const query = db
			.select({ name: fullName, age: users.age.as('ageOfUser'), id: users.id.as('userId') })
			.from(users)
			.leftJoin(developers, eq(users.id.as('userId'), developers.user_id))
			.orderBy(asc(users.first_name));

		expect(query.toSQL()).toEqual({
			sql:
				'select "users"."firstName" || \' \' || "users"."lastName" as "name", "users"."AGE" as "ageOfUser", "users"."id" as "userId" from "users" left join "developers" on "userId" = "developers"."userId" order by "users"."firstName" asc',
			params: [],
		});
	});

	it('insert (on conflict do update) returning as', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ first_name: 'John', last_name: 'Doe', age: 30 })
			.onConflictDoUpdate({ target: users.first_name.as('userFirstName'), set: { age: 31 } })
			.returning({ firstName: users.first_name, age: users.age.as('userAge') });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("id", "firstName", "lastName", "AGE") values (null, ?, ?, ?) on conflict ("userFirstName") do update set "AGE" = ? returning "firstName", "AGE" as "userAge"',
			params: ['John', 'Doe', 30, 31],
		});
	});

	it('update returning as', ({ expect }) => {
		const query = db
			.update(users)
			.set({ first_name: 'John', last_name: 'Doe', age: 30 })
			.where(eq(users.id, 1))
			.returning({ firstName: users.first_name.as('usersName'), age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'update "users" set "firstName" = ?, "lastName" = ?, "AGE" = ? where "users"."id" = ? returning "firstName" as "usersName", "AGE"',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete returning as', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1))
			.returning({ firstName: users.first_name, age: users.age.as('usersAge') });

		expect(query.toSQL()).toEqual({
			sql: 'delete from "users" where "users"."id" = ? returning "firstName", "AGE" as "usersAge"',
			params: [1],
		});
	});

	describe('selection casts', () => {
		const castCodecs = { ...betterSQLite3Codecs, integer: { ...betterSQLite3Codecs.integer, cast: castToText } };
		const castDb = drizzle({ client: new Database(':memory:'), codecs: castCodecs });
		const casts = camelCase.table('casts', { cast_value: integer() });
		const castTargets = camelCase.table('cast_targets', { target_id: text() });
		const castSubquery = () => castDb.select({ cast_value: casts.cast_value }).from(casts).as('sq');

		it(`Cast respects alias config`, ({ expect }) => {
			expect(castDb.select({ c: casts.cast_value }).from(casts).toSQL().sql).toEqual(
				'select cast("castValue" as text) from "casts"',
			);
			expect(castDb.select({ c: casts.cast_value.as('alias') }).from(casts).toSQL().sql).toEqual(
				'select cast("castValue" as text) as "alias" from "casts"',
			);
		});

		it(`Cast applied to selected subquery depending on it's selection`, ({ expect }) => {
			expect(castDb.select({ x: castSubquery() }).from(castTargets).toSQL().sql).toEqual(
				'select cast((select "castValue" from "casts") as text) "sq" from "cast_targets"',
			);
		});

		it('Nested queries ignore casts', ({ expect }) => {
			const outer = castDb.select({ x: castSubquery() }).from(castTargets).as('outer');

			expect(castDb.select().from(outer).toSQL().sql).toEqual(
				'select cast((select "castValue" from "casts") as text) "sq" from (select (select "castValue" from "casts") "sq" from "cast_targets") "outer"',
			);
		});

		it(`Column as decoder applies cast`, ({ expect }) => {
			expect(
				castDb.select({
					x: sql`${casts.cast_value}`.mapWith(casts.cast_value),
					y: sql`${casts.cast_value}`.mapWith(casts.cast_value).as('y'),
				}).from(casts).toSQL().sql,
			)
				.toEqual('select cast("castValue" as text), cast("castValue" as text) as "y" from "casts"');
		});

		it(`Cast doesn't bleed params into selection`, ({ expect }) => {
			// Regression test for pre-existing issue
			const query = castDb.select({ x: castSubquery() }).from(castTargets).toSQL();

			expect(query.params).toEqual([]);
			expect(query.sql).not.toMatch(/\$\d|\?|@par/);
		});

		it(`No double spaces in union's 'order by' `, ({ expect }) => {
			const branch = () => castDb.select({ x: casts.cast_value }).from(casts);
			const query = branch()
				.unionAll(branch())
				.orderBy(sql`1`)
				.limit(3);

			expect(query.toSQL().sql).toEqual(
				'select cast("castValue" as text) from (select "castValue" from "casts" union all select "castValue" from "casts" order by 1 limit ?) "drizzle_union"',
			);
			expect(query.toSQL().sql).not.toContain('order by 1  ');
		});
	});
});
