import { describe, it } from 'vitest';
import { defineRelations } from '~/relations';
import { drizzle, singleStoreCodecs } from '~/singlestore';
import { alias, boolean, camelCase, castToText, int, QueryBuilder, serial, text, union } from '~/singlestore-core';
import { asc, eq, sql } from '~/sql';

const testSchema = camelCase.schema('test');
const users = camelCase.table('users', {
	id: serial().primaryKey(),
	first_name: text().notNull(),
	last_name: text().notNull(),
	// Test that custom aliases remain
	age: int('AGE'),
});

// singlestore has no foreign keys, so `developers` points at `users` by convention only
const developers = testSchema.table('developers', {
	user_id: serial().primaryKey(),
	uses_drizzle_orm: boolean().notNull(),
});

const devs = alias(developers, 'devs');

const db = drizzle.mock();

const projects = camelCase.table('projects', {
	id: int().primaryKey(),
	developer_id: int(),
	project_name: text(),
});

const staff = new QueryBuilder().select({
	id: users.id,
	first_name: users.first_name,
	role: sql<string>`upper(${users.last_name})`.as('user_role'),
}).from(users).as('staff_members');

const rqbRelations = defineRelations({ users, developers, projects, staff }, (r) => ({
	users: {
		developers: r.one.developers({ from: r.users.id, to: r.developers.user_id }),
	},
	developers: {
		user: r.one.users({ from: r.developers.user_id, to: r.users.id }),
		projects: r.many.projects({ from: r.developers.user_id, to: r.projects.developer_id }),
		member: r.one.staff({ from: r.developers.user_id, to: r.staff.role }),
	},
	projects: {
		developer: r.one.developers({ from: r.projects.developer_id, to: r.developers.user_id }),
	},
	staff: {
		developers: r.many.developers({ from: r.staff.id, to: r.developers.user_id }),
	},
}));
const rqbDb = drizzle.mock({ relations: rqbRelations });

const fullName = sql`${users.first_name} || ' ' || ${users.last_name}`.as('name');

describe('singlestore to camel case', () => {
	it('unicode column names', ({ expect }) => {
		const unicode = camelCase.table('unicode', {
			칼럼명: text(),
		});

		expect(db.select().from(unicode).toSQL().sql).toEqual(
			'select `칼럼명` from `unicode`',
		);
	});

	it('qualifier preservation for sql fields', ({ expect }) => {
		const a = camelCase.table('a', { id: int('id').primaryKey(), cId: int().notNull() });
		const b = camelCase.table('b', { id: int('id').primaryKey(), cId: int().notNull(), label: text() });
		const corr = sql`(select ${b.label} from ${b} where ${b.cId} = ${a.cId})`;

		expect(db.select({ id: a.id, bRaw: corr }).from(a).toSQL().sql).toEqual(
			'select `id`, (select `b`.`label` from `b` where `b`.`cId` = `a`.`cId`) from `a`',
		);
		expect(db.select({ id: a.id, bRaw: corr.as('b_raw') }).from(a).toSQL().sql).toEqual(
			'select `id`, (select `b`.`label` from `b` where `b`.`cId` = `a`.`cId`) as `b_raw` from `a`',
		);
		expect(db.select({ id: a.id }).from(a).where(corr).toSQL().sql).toEqual(
			'select `id` from `a` where (select `b`.`label` from `b` where `b`.`cId` = `a`.`cId`)',
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
				"select cast(`sq`.`id` as char), `sq`.`name` from `users` left join (select `id`, `firstName` || ' ' || `lastName` as `name` from `users`) `sq` on `users`.`id` = `sq`.`id`",
			params: [],
		});
	});

	it('relational query over a subquery source', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({
			columns: { id: true, role: true },
			where: { role: { like: 'A%' } },
			orderBy: { first_name: 'asc' },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`user_role` as `role`, coalesce(`developers`.`r`, json_build_array()) as `developers` from `staff_members` as `d0` left join lateral(select json_agg(json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true where `d0`.`user_role` like ? order by `d0`.`firstName` asc",
			params: ['A%'],
		});
	});

	it("relational query joining on a subquery's aliased sql field", ({ expect }) => {
		const query = rqbDb.query.developers.findMany({ with: { member: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `member`.`r` as `member` from `test`.`developers` as `d0` left join lateral(select json_build_object('id', `id`, 'first_name', `first_name`, 'role', `role`) as `r` from (select cast(`d1`.`id` as char) as `id`, `d1`.`firstName` as `first_name`, `d1`.`user_role` as `role` from `staff_members` as `d1` where `d0`.`userId` = `d1`.`user_role` limit ?) as `t`) as `member` on true",
			params: [1],
		});
	});

	it('relational query - table, single level (find many)', ({ expect }) => {
		const query = rqbDb.query.users.findMany({});

		expect(query.toSQL()).toEqual({
			sql:
				'select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age` from `users` as `d0`',
			params: [],
		});
	});

	it('relational query - table, single level (find first)', ({ expect }) => {
		const query = rqbDb.query.users.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age` from `users` as `d0` limit ?',
			params: [1],
		});
	});

	it('relational query - table, nested (find many)', ({ expect }) => {
		const query = rqbDb.query.users.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true",
			params: [1],
		});
	});

	it('relational query - table, nested (find first)', ({ expect }) => {
		const query = rqbDb.query.users.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true limit ?",
			params: [1, 1],
		});
	});

	it('relational query - table, deeply nested (find many)', ({ expect }) => {
		const query = rqbDb.query.users.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, coalesce(`projects`.`r`, json_build_array()) as `projects` from `test`.`developers` as `d1` left join lateral(select json_agg(json_build_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true",
			params: [1],
		});
	});

	it('relational query - table, deeply nested (find first)', ({ expect }) => {
		const query = rqbDb.query.users.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, coalesce(`projects`.`r`, json_build_array()) as `projects` from `test`.`developers` as `d1` left join lateral(select json_agg(json_build_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true limit ?",
			params: [1, 1],
		});
	});

	it('relational query - subquery, single level (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role` from `staff_members` as `d0` limit ?',
			params: [1],
		});
	});

	it('relational query - subquery, nested (find many)', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, coalesce(`developers`.`r`, json_build_array()) as `developers` from `staff_members` as `d0` left join lateral(select json_agg(json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true",
			params: [],
		});
	});

	it('relational query - mixed table -> table -> subquery (find many)', ({ expect }) => {
		const query = rqbDb.query.projects.findMany({
			with: { developer: { with: { member: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select `d0`.`id` as `id`, `d0`.`developerId` as `developer_id`, `d0`.`projectName` as `project_name`, `developer`.`r` as `developer` from `projects` as `d0` left join lateral(select json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'member', `member`) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, `member`.`r` as `member` from `test`.`developers` as `d1` left join lateral(select json_build_object('id', `id`, 'first_name', `first_name`, 'role', `role`) as `r` from (select cast(`d2`.`id` as char) as `id`, `d2`.`firstName` as `first_name`, `d2`.`user_role` as `role` from `staff_members` as `d2` where `d1`.`userId` = `d2`.`user_role` limit ?) as `t`) as `member` on true where `d0`.`developerId` = `d1`.`userId` limit ?) as `t`) as `developer` on true",
			params: [1, 1],
		});
	});

	it('relational query - mixed subquery -> table -> table (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, coalesce(`developers`.`r`, json_build_array()) as `developers` from `staff_members` as `d0` left join lateral(select json_agg(json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`)) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, coalesce(`projects`.`r`, json_build_array()) as `projects` from `test`.`developers` as `d1` left join lateral(select json_agg(json_build_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true limit ?",
			params: [1],
		});
	});

	it('relational query - subquery, single level (find many)', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({});

		expect(query.toSQL()).toEqual({
			sql:
				'with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role` from `staff_members` as `d0`',
			params: [],
		});
	});

	it('relational query - subquery, nested (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, coalesce(`developers`.`r`, json_build_array()) as `developers` from `staff_members` as `d0` left join lateral(select json_agg(json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true limit ?",
			params: [1],
		});
	});

	it('relational query - subquery, deeply nested (find many)', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, coalesce(`developers`.`r`, json_build_array()) as `developers` from `staff_members` as `d0` left join lateral(select json_agg(json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`)) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, coalesce(`projects`.`r`, json_build_array()) as `projects` from `test`.`developers` as `d1` left join lateral(select json_agg(json_build_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true",
			params: [],
		});
	});

	it('relational query - subquery, deeply nested (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, coalesce(`developers`.`r`, json_build_array()) as `developers` from `staff_members` as `d0` left join lateral(select json_agg(json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`)) as `r` from (select cast(`d1`.`userId` as char) as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, coalesce(`projects`.`r`, json_build_array()) as `projects` from `test`.`developers` as `d1` left join lateral(select json_agg(json_build_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true limit ?",
			params: [1],
		});
	});

	it('relational query - mixed table -> subquery -> table (find many)', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({ with: { member: { with: { developers: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `member`.`r` as `member` from `test`.`developers` as `d0` left join lateral(select json_build_object('id', `id`, 'first_name', `first_name`, 'role', `role`, 'developers', `developers`) as `r` from (select cast(`d1`.`id` as char) as `id`, `d1`.`firstName` as `first_name`, `d1`.`user_role` as `role`, coalesce(`developers`.`r`, json_build_array()) as `developers` from `staff_members` as `d1` left join lateral(select json_agg(json_build_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)) as `r` from (select cast(`d2`.`userId` as char) as `user_id`, `d2`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d2` where `d1`.`id` = `d2`.`userId`) as `t`) as `developers` on true where `d0`.`userId` = `d1`.`user_role` limit ?) as `t`) as `member` on true",
			params: [1],
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
				"select `users`.`firstName` || ' ' || `users`.`lastName` as `name`, `users`.`AGE` from `users` left join `test`.`developers` on `users`.`id` = `test`.`developers`.`userId` order by `users`.`firstName` asc",
			params: [],
		});
	});

	it('select (with alias)', ({ expect }) => {
		const query = db
			.select({ firstName: users.first_name })
			.from(users)
			.leftJoin(devs, eq(users.id, devs.user_id));

		expect(query.toSQL()).toEqual({
			sql:
				'select `users`.`firstName` from `users` left join `test`.`developers` `devs` on `users`.`id` = `devs`.`userId`',
			params: [],
		});
	});

	it('with CTE', ({ expect }) => {
		const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with `cte` as (select `firstName` || ' ' || `lastName` as `name` from `users`) select `name` from `cte`",
			params: [],
		});
	});

	it('with CTE (with query builder)', ({ expect }) => {
		const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with `cte` as (select `firstName` || ' ' || `lastName` as `name` from `users`) select `name` from `cte`",
			params: [],
		});
	});

	it('set operator', ({ expect }) => {
		const query = db
			.select({ firstName: users.first_name })
			.from(users)
			.union(db.select({ firstName: users.first_name }).from(users));

		expect(query.toSQL()).toEqual({
			sql:
				'select `firstName` from ((select `firstName` from `users`) union (select `firstName` from `users`)) `drizzle_union`',
			params: [],
		});
	});

	it('set operator (function)', ({ expect }) => {
		const query = union(
			db.select({ firstName: users.first_name }).from(users),
			db.select({ firstName: users.first_name }).from(users),
		);

		expect(query.toSQL()).toEqual({
			sql:
				'select `firstName` from ((select `firstName` from `users`) union (select `firstName` from `users`)) `drizzle_union`',
			params: [],
		});
	});

	it('insert', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into `users` (`id`, `firstName`, `lastName`, `AGE`) values (default, ?, ?, ?)',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (on duplicate key update)', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ first_name: 'John', last_name: 'Doe', age: 30 })
			.onDuplicateKeyUpdate({ set: { age: 31 } });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into `users` (`id`, `firstName`, `lastName`, `AGE`) values (default, ?, ?, ?) on duplicate key update `AGE` = ?',
			params: ['John', 'Doe', 30, 31],
		});
	});

	it('insert (column selection)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into `users` (`firstName`, `lastName`, `AGE`) values (?, ?, ?)',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (column selection, multiple rows)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name')
			.values([{ first_name: 'John', last_name: 'Doe' }, { first_name: 'Jane', last_name: 'Roe' }]);

		expect(query.toSQL()).toEqual({
			sql: 'insert into `users` (`firstName`, `lastName`) values (?, ?), (?, ?)',
			params: ['John', 'Doe', 'Jane', 'Roe'],
		});
	});

	it('insert (column selection, omitted optional column)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe' });

		expect(query.toSQL()).toEqual({
			sql: 'insert into `users` (`firstName`, `lastName`, `AGE`) values (?, ?, default)',
			params: ['John', 'Doe'],
		});
	});

	it('insert (column selection) emits columns in list order', ({ expect }) => {
		const query = db
			.insert(users, 'age', 'last_name', 'first_name')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into `users` (`AGE`, `lastName`, `firstName`) values (?, ?, ?)',
			params: [30, 'Doe', 'John'],
		});
	});

	it('insert (column selection) on duplicate key update', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 })
			.onDuplicateKeyUpdate({ set: { age: 31 } });

		expect(query.toSQL()).toEqual({
			sql: 'insert into `users` (`firstName`, `lastName`, `AGE`) values (?, ?, ?) on duplicate key update `AGE` = ?',
			params: ['John', 'Doe', 30, 31],
		});
	});

	it('update', ({ expect }) => {
		const query = db
			.update(users)
			.set({ first_name: 'John', last_name: 'Doe', age: 30 })
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'update `users` set `firstName` = ?, `lastName` = ?, `AGE` = ? where `users`.`id` = ?',
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
			sql: 'select `AGE` as `ageOfUser`, cast(`id` as char) as `userId` from `users` order by `userId` asc',
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
				"select `users`.`firstName` || ' ' || `users`.`lastName` as `name`, `users`.`AGE` as `ageOfUser`, cast(`users`.`id` as char) as `userId` from `users` left join `test`.`developers` on `userId` = `test`.`developers`.`userId` order by `users`.`firstName` asc",
			params: [],
		});
	});

	describe('selection casts', () => {
		const castCodecs = { ...singleStoreCodecs, int: { ...singleStoreCodecs.int, cast: castToText } };
		const castDb = drizzle.mock({ codecs: castCodecs });
		const casts = camelCase.table('casts', { cast_value: int() });
		const castTargets = camelCase.table('cast_targets', { target_id: text() });
		const castSubquery = () => castDb.select({ cast_value: casts.cast_value }).from(casts).as('sq');

		it(`Cast respects alias config`, ({ expect }) => {
			expect(castDb.select({ c: casts.cast_value }).from(casts).toSQL().sql).toEqual(
				'select cast(`castValue` as char) from `casts`',
			);
			expect(castDb.select({ c: casts.cast_value.as('alias') }).from(casts).toSQL().sql).toEqual(
				'select cast(`castValue` as char) as `alias` from `casts`',
			);
		});

		it(`Cast applied to selected subquery depending on it's selection`, ({ expect }) => {
			expect(castDb.select({ x: castSubquery() }).from(castTargets).toSQL().sql).toEqual(
				'select cast((select `castValue` from `casts`) as char) `sq` from `cast_targets`',
			);
		});

		it('Nested queries ignore casts', ({ expect }) => {
			const outer = castDb.select({ x: castSubquery() }).from(castTargets).as('outer');

			expect(castDb.select().from(outer).toSQL().sql).toEqual(
				'select cast((select `castValue` from `casts`) as char) `sq` from (select (select `castValue` from `casts`) `sq` from `cast_targets`) `outer`',
			);
		});

		it(`Column as decoder applies cast`, ({ expect }) => {
			expect(
				castDb.select({
					x: sql`${casts.cast_value}`.mapWith(casts.cast_value),
					y: sql`${casts.cast_value}`.mapWith(casts.cast_value).as('y'),
				}).from(casts).toSQL().sql,
			)
				.toEqual('select cast(`castValue` as char), cast(`castValue` as char) as `y` from `casts`');
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
				'select cast(`castValue` as char) from ((select `castValue` from `casts`) union all (select `castValue` from `casts`) order by 1 limit ?) `drizzle_union`',
			);
			expect(query.toSQL().sql).not.toContain('order by 1  ');
		});
	});
});
