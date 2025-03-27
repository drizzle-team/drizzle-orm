import postgres from 'postgres';
import { beforeEach, describe, it } from 'vitest';
import { alias, boolean, integer, pgSchema, pgTable, serial, text, union } from '~/pg-core';
import { drizzle } from '~/postgres-js';
import { relations } from '~/relations';
import { asc, eq, sql } from '~/sql';

const testSchema = pgSchema('test');
const users = pgTable('users', {
	id: serial().primaryKey(),
	firstName: text().notNull(),
	lastName: text().notNull(),
	// Test that custom aliases remain
	age: integer('AGE'),
});
const usersRelations = relations(users, ({ one }) => ({
	developers: one(developers),
}));
const developers = testSchema.table('developers', {
	userId: serial().primaryKey().references(() => users.id),
	usesDrizzleORM: boolean().notNull(),
});
const developersRelations = relations(developers, ({ one }) => ({
	user: one(users, {
		fields: [developers.userId],
		references: [users.id],
	}),
}));
const devs = alias(developers, 'devs');
const schema = { users, usersRelations, developers, developersRelations };

const db = drizzle(postgres(''), { schema, casing: 'snake_case' });

const usersCache = {
	'public.users.id': 'id',
	'public.users.firstName': 'first_name',
	'public.users.lastName': 'last_name',
	'public.users.AGE': 'age',
};
const developersCache = {
	'test.developers.userId': 'user_id',
	'test.developers.usesDrizzleORM': 'uses_drizzle_orm',
};
const cache = {
	...usersCache,
	...developersCache,
};

const fullName = sql`${users.firstName} || ' ' || ${users.lastName}`.as('name');

describe('postgres to snake case', () => {
	beforeEach(() => {
		db.dialect.casing.clearCache();
	});

	it('select', ({ expect }) => {
		const query = db
			.select({ name: fullName, age: users.age })
			.from(users)
			.leftJoin(developers, eq(users.id, developers.userId))
			.orderBy(asc(users.firstName));

		expect(query.toSQL()).toEqual({
			sql:
				'select "users"."first_name" || \' \' || "users"."last_name" as "name", "users"."AGE" from "users" left join "test"."developers" on "users"."id" = "test"."developers"."user_id" order by "users"."first_name" asc',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(cache);
	});

	it('select (with alias)', ({ expect }) => {
		const query = db
			.select({ firstName: users.firstName })
			.from(users)
			.leftJoin(devs, eq(users.id, devs.userId));

		expect(query.toSQL()).toEqual({
			sql:
				'select "users"."first_name" from "users" left join "test"."developers" "devs" on "users"."id" = "devs"."user_id"',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(cache);
	});

	it('with CTE', ({ expect }) => {
		const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql:
				'with "cte" as (select "first_name" || \' \' || "last_name" as "name" from "users") select "name" from "cte"',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('with CTE (with query builder)', ({ expect }) => {
		const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql:
				'with "cte" as (select "first_name" || \' \' || "last_name" as "name" from "users") select "name" from "cte"',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('set operator', ({ expect }) => {
		const query = db
			.select({ firstName: users.firstName })
			.from(users)
			.union(db.select({ firstName: users.firstName }).from(users));

		expect(query.toSQL()).toEqual({
			sql: '(select "first_name" from "users") union (select "first_name" from "users")',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('set operator (function)', ({ expect }) => {
		const query = union(
			db.select({ firstName: users.firstName }).from(users),
			db.select({ firstName: users.firstName }).from(users),
		);

		expect(query.toSQL()).toEqual({
			sql: '(select "first_name" from "users") union (select "first_name" from "users")',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('query (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({
			columns: {
				id: true,
				age: true,
			},
			extras: {
				fullName,
			},
			where: eq(users.id, 1),
			with: {
				developers: {
					columns: {
						usesDrizzleORM: true,
					},
				},
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "users"."id", "users"."AGE", "users"."first_name" || \' \' || "users"."last_name" as "name", "users_developers"."data" as "developers" from "users" "users" left join lateral (select json_build_array("users_developers"."uses_drizzle_orm") as "data" from (select * from "test"."developers" "users_developers" where "users_developers"."user_id" = "users"."id" limit $1) "users_developers") "users_developers" on true where "users"."id" = $2 limit $3',
			params: [1, 1, 1],
			typings: ['none', 'none', 'none'],
		});
		expect(db.dialect.casing.cache).toEqual(cache);
	});

	it('query (find many)', ({ expect }) => {
		const query = db.query.users.findMany({
			columns: {
				id: true,
				age: true,
			},
			extras: {
				fullName,
			},
			where: eq(users.id, 1),
			with: {
				developers: {
					columns: {
						usesDrizzleORM: true,
					},
				},
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "users"."id", "users"."AGE", "users"."first_name" || \' \' || "users"."last_name" as "name", "users_developers"."data" as "developers" from "users" "users" left join lateral (select json_build_array("users_developers"."uses_drizzle_orm") as "data" from (select * from "test"."developers" "users_developers" where "users_developers"."user_id" = "users"."id" limit $1) "users_developers") "users_developers" on true where "users"."id" = $2',
			params: [1, 1],
			typings: ['none', 'none'],
		});
		expect(db.dialect.casing.cache).toEqual(cache);
	});

	it('insert (on conflict do nothing)', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ firstName: 'John', lastName: 'Doe', age: 30 })
			.onConflictDoNothing({ target: users.firstName })
			.returning({ firstName: users.firstName, age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("id", "first_name", "last_name", "AGE") values (default, $1, $2, $3) on conflict ("first_name") do nothing returning "first_name", "AGE"',
			params: ['John', 'Doe', 30],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('insert (on conflict do update)', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ firstName: 'John', lastName: 'Doe', age: 30 })
			.onConflictDoUpdate({ target: users.firstName, set: { age: 31 } })
			.returning({ firstName: users.firstName, age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("id", "first_name", "last_name", "AGE") values (default, $1, $2, $3) on conflict ("first_name") do update set "AGE" = $4 returning "first_name", "AGE"',
			params: ['John', 'Doe', 30, 31],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('update', ({ expect }) => {
		const query = db
			.update(users)
			.set({ firstName: 'John', lastName: 'Doe', age: 30 })
			.where(eq(users.id, 1))
			.returning({ firstName: users.firstName, age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'update "users" set "first_name" = $1, "last_name" = $2, "AGE" = $3 where "users"."id" = $4 returning "first_name", "AGE"',
			params: ['John', 'Doe', 30, 1],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('delete', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1))
			.returning({ firstName: users.firstName, age: users.age });

		expect(query.toSQL()).toEqual({
			sql: 'delete from "users" where "users"."id" = $1 returning "first_name", "AGE"',
			params: [1],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});
});
