import { describe, it } from 'vitest';
import { drizzle, nodeCockroachCodecs } from '~/cockroach';
import { alias, boolean, camelCase, castToText, int4, text, union } from '~/cockroach-core';
import { defineRelations } from '~/relations';
import { asc, eq, sql } from '~/sql';

const testSchema = camelCase.schema('test');
const users = camelCase.table('users', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	first_name: text().notNull(),
	last_name: text().notNull(),
	// Test that custom aliases remain
	age: int4('AGE'),
});
const developers = testSchema.table('developers', {
	user_id: int4().primaryKey().generatedByDefaultAsIdentity().references(() => users.id),
	uses_drizzle_orm: boolean().notNull(),
});
const devs = alias(developers, 'devs');
const relations = defineRelations({ users, developers }, (r) => ({
	users: { developers: r.one.developers({ from: r.users.id, to: r.developers.user_id }) },
	developers: { user: r.one.users({ from: r.developers.user_id, to: r.users.id }) },
}));

const db = drizzle.mock({ relations });

const fullName = sql`${users.first_name} || ' ' || ${users.last_name}`.as('name');

describe('cockroach to camel case', () => {
	it('unicode column names', ({ expect }) => {
		const unicode = camelCase.table('unicode', {
			칼럼명: text(),
		});

		expect(db.select().from(unicode).toSQL().sql).toEqual(
			'select "칼럼명" from "unicode"',
		);
	});

	it('qualifier preservation for sql fields', ({ expect }) => {
		const a = camelCase.table('a', { id: int4('id').primaryKey(), cId: int4().notNull() });
		const b = camelCase.table('b', { id: int4('id').primaryKey(), cId: int4().notNull(), label: text() });
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
				'select "users"."firstName" || \' \' || "users"."lastName" as "name", "users"."AGE" from "users" left join "test"."developers" on "users"."id" = "test"."developers"."userId" order by "users"."firstName" asc',
			params: [],
		});
	});

	it('select (with alias)', ({ expect }) => {
		const query = db
			.select({ first_name: users.first_name })
			.from(users)
			.leftJoin(devs, eq(users.id, devs.user_id));

		expect(query.toSQL()).toEqual({
			sql:
				'select "users"."firstName" from "users" left join "test"."developers" "devs" on "users"."id" = "devs"."userId"',
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
				'select "firstName" from ((select "firstName" from "users") union (select "firstName" from "users")) "drizzle_union"',
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
				'select "firstName" from ((select "firstName" from "users") union (select "firstName" from "users")) "drizzle_union"',
			params: [],
		});
	});

	it('query (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({
			columns: {
				id: true,
				age: true,
			},
			extras: {
				fullName: ({ first_name, last_name }) => sql`${first_name} || ' ' || ${last_name}`.as('name'),
			},
			where: { id: 1 },
			with: {
				developers: {
					columns: {
						uses_drizzle_orm: true,
					},
				},
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."AGE" as "age", ("d0"."firstName" || \' \' || "d0"."lastName") as "fullName", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $1) as "t") as "developers" on true where "d0"."id" = $2 limit $3',
			params: [1, 1, 1],
		});
	});

	it('query (find many)', ({ expect }) => {
		const query = db.query.users.findMany({
			columns: {
				id: true,
				age: true,
			},
			extras: {
				fullName: ({ first_name, last_name }) => sql`${first_name} || ' ' || ${last_name}`.as('name'),
			},
			where: { id: 1 },
			with: {
				developers: {
					columns: {
						uses_drizzle_orm: true,
					},
				},
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."AGE" as "age", ("d0"."firstName" || \' \' || "d0"."lastName") as "fullName", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $1) as "t") as "developers" on true where "d0"."id" = $2',
			params: [1, 1],
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
				'insert into "users" ("id", "firstName", "lastName", "AGE") values (default, $1, $2, $3) on conflict ("firstName") do nothing returning "firstName", "AGE"',
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
				'insert into "users" ("id", "firstName", "lastName", "AGE") values (default, $1, $2, $3) on conflict ("firstName") do update set "AGE" = $4 returning "firstName", "AGE"',
			params: ['John', 'Doe', 30, 31],
		});
	});

	it('insert (column selection)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 })
			.returning({ first_name: users.first_name, age: users.age });

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("firstName", "lastName", "AGE") values ($1, $2, $3) returning "firstName", "AGE"',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (column selection, multiple rows)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name')
			.values([{ first_name: 'John', last_name: 'Doe' }, { first_name: 'Jane', last_name: 'Roe' }]);

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("firstName", "lastName") values ($1, $2), ($3, $4)',
			params: ['John', 'Doe', 'Jane', 'Roe'],
		});
	});

	it('insert (column selection, omitted optional column)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe' });

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("firstName", "lastName", "AGE") values ($1, $2, default)',
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
			sql: 'insert into "users" ("AGE", "lastName", "firstName") values ($1, $2, $3)',
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
				'insert into "users" ("firstName", "lastName", "AGE") values ($1, $2, $3) on conflict ("firstName") do update set "AGE" = $4 returning "firstName", "AGE"',
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
				'update "users" set "firstName" = $1, "lastName" = $2, "AGE" = $3 where "users"."id" = $4 returning "firstName", "AGE"',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1))
			.returning({ first_name: users.first_name, age: users.age });

		expect(query.toSQL()).toEqual({
			sql: 'delete from "users" where "users"."id" = $1 returning "firstName", "AGE"',
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
				'select "users"."firstName" || \' \' || "users"."lastName" as "name", "users"."AGE" as "ageOfUser", "users"."id" as "userId" from "users" left join "test"."developers" on "userId" = "test"."developers"."userId" order by "users"."firstName" asc',
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
				'insert into "users" ("id", "firstName", "lastName", "AGE") values (default, $1, $2, $3) on conflict ("userFirstName") do update set "AGE" = $4 returning "firstName", "AGE" as "userAge"',
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
				'update "users" set "firstName" = $1, "lastName" = $2, "AGE" = $3 where "users"."id" = $4 returning "firstName" as "usersName", "AGE"',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete returning as', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1))
			.returning({ firstName: users.first_name, age: users.age.as('usersAge') });

		expect(query.toSQL()).toEqual({
			sql: 'delete from "users" where "users"."id" = $1 returning "firstName", "AGE" as "usersAge"',
			params: [1],
		});
	});

	describe('selection casts', () => {
		const castCodecs = { ...nodeCockroachCodecs, int4: { ...nodeCockroachCodecs.int4, cast: castToText } };
		const castDb = drizzle.mock({ codecs: castCodecs });
		const casts = camelCase.table('casts', { cast_value: int4() });
		const castTargets = camelCase.table('cast_targets', { target_id: text() });
		const castSubquery = () => castDb.select({ cast_value: casts.cast_value }).from(casts).as('sq');

		it(`Cast respects alias config`, ({ expect }) => {
			expect(castDb.select({ c: casts.cast_value }).from(casts).toSQL().sql).toEqual(
				'select "castValue"::text from "casts"',
			);
			expect(castDb.select({ c: casts.cast_value.as('alias') }).from(casts).toSQL().sql).toEqual(
				'select "castValue"::text as "alias" from "casts"',
			);
		});

		it(`Cast applied to selected subquery depending on it's selection`, ({ expect }) => {
			expect(castDb.select({ x: castSubquery() }).from(castTargets).toSQL().sql).toEqual(
				'select (select "castValue" from "casts")::text "sq" from "cast_targets"',
			);
		});

		it('Nested queries ignore casts', ({ expect }) => {
			const outer = castDb.select({ x: castSubquery() }).from(castTargets).as('outer');

			expect(castDb.select().from(outer).toSQL().sql).toEqual(
				'select (select "castValue" from "casts")::text "sq" from (select (select "castValue" from "casts") "sq" from "cast_targets") "outer"',
			);
		});

		it(`Column as decoder applies cast`, ({ expect }) => {
			expect(
				castDb.select({
					x: sql`${casts.cast_value}`.mapWith(casts.cast_value),
					y: sql`${casts.cast_value}`.mapWith(casts.cast_value).as('y'),
				}).from(casts).toSQL().sql,
			)
				.toEqual('select "castValue"::text, "castValue"::text as "y" from "casts"');
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
				'select "castValue"::text from ((select "castValue" from "casts") union all (select "castValue" from "casts")) "drizzle_union" order by 1 limit $1',
			);
			expect(query.toSQL().sql).not.toContain('order by 1  ');
		});

		it(`$with field is cast by field's alias`, ({ expect }) => {
			const w = castDb.$with('w').as(castDb.select({ cast_value: casts.cast_value }).from(casts));

			expect(castDb.with(w).select({ x: w }).from(w).toSQL().sql).toEqual(
				'with "w" as (select "castValue" from "casts") select "w"::text from "w"',
			);
		});
	});
});
