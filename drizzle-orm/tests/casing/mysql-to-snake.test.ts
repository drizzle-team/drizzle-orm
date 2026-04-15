import { Client } from '@planetscale/database';
import { connect } from '@tidbcloud/serverless';
import { describe, it } from 'vitest';
import { relations } from '~/_relations';
import { alias, boolean, int, serial, snakeCase, text, union } from '~/mysql-core';
import { drizzle as planetscale } from '~/planetscale-serverless';
import { asc, eq, sql } from '~/sql';
import { drizzle as mysql } from '~/tidb-serverless';

const testSchema = snakeCase.schema('test');
const users = snakeCase.table('users', {
	id: serial().primaryKey(),
	firstName: text().notNull(),
	lastName: text().notNull(),
	// Test that custom aliases remain
	age: int('AGE'),
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

const db = mysql({ client: connect({}), schema });
const ps = planetscale({ client: new Client({}), schema });

const fullName = sql`${users.firstName} || ' ' || ${users.lastName}`.as('name');

describe('mysql to snake case', () => {
	it('select', ({ expect }) => {
		const query = db
			.select({ name: fullName, age: users.age })
			.from(users)
			.leftJoin(developers, eq(users.id, developers.userId))
			.orderBy(asc(users.firstName));

		expect(query.toSQL()).toEqual({
			sql:
				"select `users`.`first_name` || ' ' || `users`.`last_name` as `name`, `users`.`AGE` from `users` left join `test`.`developers` on `users`.`id` = `test`.`developers`.`user_id` order by `users`.`first_name` asc",
			params: [],
		});
	});

	it('select (with alias)', ({ expect }) => {
		const query = db
			.select({ firstName: users.firstName })
			.from(users)
			.leftJoin(devs, eq(users.id, devs.userId));

		expect(query.toSQL()).toEqual({
			sql:
				'select `users`.`first_name` from `users` left join `test`.`developers` `devs` on `users`.`id` = `devs`.`user_id`',
			params: [],
		});
	});

	it('with CTE', ({ expect }) => {
		const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with `cte` as (select `first_name` || ' ' || `last_name` as `name` from `users`) select `name` from `cte`",
			params: [],
		});
	});

	it('with CTE (with query builder)', ({ expect }) => {
		const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with `cte` as (select `first_name` || ' ' || `last_name` as `name` from `users`) select `name` from `cte`",
			params: [],
		});
	});

	it('set operator', ({ expect }) => {
		const query = db
			.select({ firstName: users.firstName })
			.from(users)
			.union(db.select({ firstName: users.firstName }).from(users));

		expect(query.toSQL()).toEqual({
			sql: '(select `first_name` from `users`) union (select `first_name` from `users`)',
			params: [],
		});
	});

	it('set operator (function)', ({ expect }) => {
		const query = union(
			db.select({ firstName: users.firstName }).from(users),
			db.select({ firstName: users.firstName }).from(users),
		);

		expect(query.toSQL()).toEqual({
			sql: '(select `first_name` from `users`) union (select `first_name` from `users`)',
			params: [],
		});
	});

	it('query (find first)', ({ expect }) => {
		const query = db._query.users.findFirst({
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
				"select `users`.`id`, `users`.`AGE`, `users`.`first_name` || ' ' || `users`.`last_name` as `name`, `users_developers`.`data` as `developers` from `users` `users` left join lateral (select json_array(`users_developers`.`uses_drizzle_orm`) as `data` from (select * from `test`.`developers` `users_developers` where `users_developers`.`user_id` = `users`.`id` limit ?) `users_developers`) `users_developers` on true where `users`.`id` = ? limit ?",
			params: [1, 1, 1],
			typings: ['none', 'none', 'none'],
		});
	});

	it('query (find first, planetscale)', ({ expect }) => {
		const query = ps._query.users.findFirst({
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
				"select `id`, `AGE`, `first_name` || ' ' || `last_name` as `name`, (select json_array(`uses_drizzle_orm`) from (select * from `test`.`developers` `users_developers` where `users_developers`.`user_id` = `users`.`id` limit ?) `users_developers`) as `developers` from `users` `users` where `users`.`id` = ? limit ?",
			params: [1, 1, 1],
			typings: ['none', 'none', 'none'],
		});
	});

	it('query (find many)', ({ expect }) => {
		const query = db._query.users.findMany({
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
				"select `users`.`id`, `users`.`AGE`, `users`.`first_name` || ' ' || `users`.`last_name` as `name`, `users_developers`.`data` as `developers` from `users` `users` left join lateral (select json_array(`users_developers`.`uses_drizzle_orm`) as `data` from (select * from `test`.`developers` `users_developers` where `users_developers`.`user_id` = `users`.`id` limit ?) `users_developers`) `users_developers` on true where `users`.`id` = ?",
			params: [1, 1],
			typings: ['none', 'none'],
		});
	});

	it('query (find many, planetscale)', ({ expect }) => {
		const query = ps._query.users.findMany({
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
				"select `id`, `AGE`, `first_name` || ' ' || `last_name` as `name`, (select json_array(`uses_drizzle_orm`) from (select * from `test`.`developers` `users_developers` where `users_developers`.`user_id` = `users`.`id` limit ?) `users_developers`) as `developers` from `users` `users` where `users`.`id` = ?",
			params: [1, 1],
			typings: ['none', 'none'],
		});
	});

	it('insert', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ firstName: 'John', lastName: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into `users` (`id`, `first_name`, `last_name`, `AGE`) values (default, ?, ?, ?)',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (on duplicate key update)', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ firstName: 'John', lastName: 'Doe', age: 30 })
			.onDuplicateKeyUpdate({ set: { age: 31 } });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into `users` (`id`, `first_name`, `last_name`, `AGE`) values (default, ?, ?, ?) on duplicate key update `AGE` = ?',
			params: ['John', 'Doe', 30, 31],
		});
	});

	it('update', ({ expect }) => {
		const query = db
			.update(users)
			.set({ firstName: 'John', lastName: 'Doe', age: 30 })
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'update `users` set `first_name` = ?, `last_name` = ?, `AGE` = ? where `users`.`id` = ?',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'delete from `users` where `users`.`id` = ?',
			params: [1],
		});
	});

	it('select columns as', ({ expect }) => {
		const query = db
			.select({ age: users.age.as('ageOfUser'), id: users.id.as('userId') })
			.from(users)
			.orderBy(asc(users.id.as('userId')));

		expect(query.toSQL()).toEqual({
			sql: 'select `AGE` as `ageOfUser`, `id` as `userId` from `users` order by `userId` asc',
			params: [],
		});
	});

	it('select join columns as', ({ expect }) => {
		const query = db
			.select({ name: fullName, age: users.age.as('ageOfUser'), id: users.id.as('userId') })
			.from(users)
			.leftJoin(developers, eq(users.id.as('userId'), developers.userId))
			.orderBy(asc(users.firstName));

		expect(query.toSQL()).toEqual({
			sql:
				"select `users`.`first_name` || ' ' || `users`.`last_name` as `name`, `users`.`AGE` as `ageOfUser`, `users`.`id` as `userId` from `users` left join `test`.`developers` on `userId` = `test`.`developers`.`user_id` order by `users`.`first_name` asc",
			params: [],
		});
	});
});
