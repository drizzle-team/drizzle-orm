import { connect } from '@tidbcloud/serverless';
import { describe, it } from 'vitest';
import { alias, boolean, camelCase, castToText, int, QueryBuilder, serial, text, union } from '~/mysql-core';
import { defineRelations } from '~/relations';
import { asc, desc, eq, exists, inArray, Param, sql } from '~/sql';
import { drizzle as mysql, tidbCodecs } from '~/tidb-serverless';

const testSchema = camelCase.schema('test');
const users = camelCase.table('users', {
	id: serial().primaryKey(),
	first_name: text().notNull(),
	last_name: text().notNull(),
	// Test that custom aliases remain
	age: int('AGE'),
});

const developers = testSchema.table('developers', {
	user_id: serial().primaryKey().references(() => users.id),
	uses_drizzle_orm: boolean().notNull(),
});

const devs = alias(developers, 'devs');

const db = mysql({ client: connect({}) });

const projects = camelCase.table('projects', {
	id: int().primaryKey(),
	developer_id: int(),
	project_name: text(),
});

const usersView = camelCase.view('users_view').as((qb) =>
	qb.select({ id: users.id, first_name: users.first_name, last_name: users.last_name }).from(users)
);

const staff = new QueryBuilder().select({
	id: users.id,
	first_name: users.first_name,
	role: sql<string>`upper(${users.last_name})`.as('user_role'),
}).from(users).as('staff_members');

const rqbRelations = defineRelations({ users, developers, projects, staff, usersView }, (r) => ({
	users: {
		developers: r.one.developers({ from: r.users.id, to: r.developers.user_id }),
	},
	developers: {
		user: r.one.users({ from: r.developers.user_id, to: r.users.id }),
		projects: r.many.projects({ from: r.developers.user_id, to: r.projects.developer_id }),
		member: r.one.staff({ from: r.developers.user_id, to: r.staff.role }),
		viewUser: r.one.usersView({ from: r.developers.user_id, to: r.usersView.id }),
	},
	projects: {
		developer: r.one.developers({ from: r.projects.developer_id, to: r.developers.user_id }),
	},
	staff: {
		developers: r.many.developers({ from: r.staff.id, to: r.developers.user_id }),
	},
	usersView: {
		developers: r.many.developers({ from: r.usersView.id, to: r.developers.user_id }),
	},
}));
const rqbDb = mysql({ client: connect({}), relations: rqbRelations });

const fullName = sql`${users.first_name} || ' ' || ${users.last_name}`.as('name');

describe('mysql to camel case', () => {
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
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`user_role` as `role`, `developers`.`r` as `developers` from `staff_members` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true where `d0`.`user_role` like ? order by `d0`.`firstName` asc",
			params: ['A%'],
		});
	});

	it("relational query joining on a subquery's aliased sql field", ({ expect }) => {
		const query = rqbDb.query.developers.findMany({ with: { member: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `member`.`r` as `member` from `test`.`developers` as `d0` left join lateral(select json_object('id', `id`, 'first_name', `first_name`, 'role', `role`) as `r` from (select `d1`.`id` as `id`, `d1`.`firstName` as `first_name`, `d1`.`user_role` as `role` from `staff_members` as `d1` where `d0`.`userId` = `d1`.`user_role` limit ?) as `t`) as `member` on true",
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
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true",
			params: [1],
		});
	});

	it('relational query - table, nested (find first)', ({ expect }) => {
		const query = rqbDb.query.users.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true limit ?",
			params: [1, 1],
		});
	});

	it('relational query - table, deeply nested (find many)', ({ expect }) => {
		const query = rqbDb.query.users.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from `test`.`developers` as `d1` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)), json_array()) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true",
			params: [1],
		});
	});

	it('relational query - table, deeply nested (find first)', ({ expect }) => {
		const query = rqbDb.query.users.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from `test`.`developers` as `d1` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)), json_array()) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true limit ?",
			params: [1, 1],
		});
	});

	it('relational query - view, single level (find first)', ({ expect }) => {
		const query = rqbDb.query.usersView.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name` from `users_view` as `d0` limit ?',
			params: [1],
		});
	});

	it('relational query - view, nested (find many)', ({ expect }) => {
		const query = rqbDb.query.usersView.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `developers`.`r` as `developers` from `users_view` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true",
			params: [],
		});
	});

	it('relational query - mixed table -> table -> view (find many)', ({ expect }) => {
		const query = rqbDb.query.projects.findMany({
			with: { developer: { with: { viewUser: true, member: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select `d0`.`id` as `id`, `d0`.`developerId` as `developer_id`, `d0`.`projectName` as `project_name`, `developer`.`r` as `developer` from `projects` as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'viewUser', `viewUser`, 'member', `member`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, `viewUser`.`r` as `viewUser`, `member`.`r` as `member` from `test`.`developers` as `d1` left join lateral(select json_object('id', `id`, 'first_name', `first_name`, 'last_name', `last_name`) as `r` from (select `d2`.`id` as `id`, `d2`.`firstName` as `first_name`, `d2`.`lastName` as `last_name` from `users_view` as `d2` where `d1`.`userId` = `d2`.`id` limit ?) as `t`) as `viewUser` on true left join lateral(select json_object('id', `id`, 'first_name', `first_name`, 'role', `role`) as `r` from (select `d2`.`id` as `id`, `d2`.`firstName` as `first_name`, `d2`.`user_role` as `role` from `staff_members` as `d2` where `d1`.`userId` = `d2`.`user_role` limit ?) as `t`) as `member` on true where `d0`.`developerId` = `d1`.`userId` limit ?) as `t`) as `developer` on true",
			params: [1, 1, 1],
		});
	});

	it('relational query - mixed view -> table -> table (find first)', ({ expect }) => {
		const query = rqbDb.query.usersView.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `developers`.`r` as `developers` from `users_view` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from `test`.`developers` as `d1` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)), json_array()) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true limit ?",
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
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, `developers`.`r` as `developers` from `staff_members` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true",
			params: [],
		});
	});

	it('relational query - subquery, nested (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, `developers`.`r` as `developers` from `staff_members` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true limit ?",
			params: [1],
		});
	});

	it('relational query - subquery, deeply nested (find many)', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, `developers`.`r` as `developers` from `staff_members` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from `test`.`developers` as `d1` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)), json_array()) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true",
			params: [],
		});
	});

	it('relational query - subquery, deeply nested (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, `developers`.`r` as `developers` from `staff_members` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'projects', `projects`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from `test`.`developers` as `d1` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)), json_array()) as `r` from (select `d2`.`id` as `id`, `d2`.`developerId` as `developer_id`, `d2`.`projectName` as `project_name` from `projects` as `d2` where `d1`.`userId` = `d2`.`developerId`) as `t`) as `projects` on true where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true limit ?",
			params: [1],
		});
	});

	it('relational query - mixed table -> subquery -> table (find many)', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({ with: { member: { with: { developers: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `member`.`r` as `member` from `test`.`developers` as `d0` left join lateral(select json_object('id', `id`, 'first_name', `first_name`, 'role', `role`, 'developers', `developers`) as `r` from (select `d1`.`id` as `id`, `d1`.`firstName` as `first_name`, `d1`.`user_role` as `role`, `developers`.`r` as `developers` from `staff_members` as `d1` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)), json_array()) as `r` from (select `d2`.`userId` as `user_id`, `d2`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d2` where `d1`.`id` = `d2`.`userId`) as `t`) as `developers` on true where `d0`.`userId` = `d1`.`user_role` limit ?) as `t`) as `member` on true",
			params: [1],
		});
	});

	it('relational query - mixed subquery -> table -> view (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({
			with: { developers: { with: { viewUser: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, `developers`.`r` as `developers` from `staff_members` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`, 'viewUser', `viewUser`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm`, `viewUser`.`r` as `viewUser` from `test`.`developers` as `d1` left join lateral(select json_object('id', `id`, 'first_name', `first_name`, 'last_name', `last_name`) as `r` from (select `d2`.`id` as `id`, `d2`.`firstName` as `first_name`, `d2`.`lastName` as `last_name` from `users_view` as `d2` where `d1`.`userId` = `d2`.`id` limit ?) as `t`) as `viewUser` on true where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true limit ?",
			params: [1, 1],
		});
	});

	it('relational query - table, nested + orderBy + limit', ({ expect }) => {
		const query = rqbDb.query.users.findMany({
			orderBy: { first_name: 'asc' },
			limit: 2,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from (select `d0`.* from `users` as `d0` order by `d0`.`firstName` asc limit ?) as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true order by `d0`.`firstName` asc",
			params: [2, 1],
		});
	});

	it('relational query - table, nested + limit + offset', ({ expect }) => {
		const query = rqbDb.query.users.findMany({ limit: 2, offset: 4, with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from (select `d0`.* from `users` as `d0` limit ? offset ?) as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true",
			params: [2, 4, 1],
		});
	});

	it('relational query - table, nested + where + limit + offset', ({ expect }) => {
		const query = rqbDb.query.users.findMany({
			where: { first_name: { like: 'A%' } },
			limit: 2,
			offset: 4,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from (select `d0`.* from `users` as `d0` where `d0`.`firstName` like ? limit ? offset ?) as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true",
			params: ['A%', 2, 4, 1],
		});
	});

	it('relational query - table, nested + relation where + limit + offset', ({ expect }) => {
		const query = rqbDb.query.users.findMany({
			where: { developers: { uses_drizzle_orm: true } },
			limit: 2,
			offset: 4,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true where exists (select * from `test`.`developers` as `f0` where ((`d0`.`id` = `f0`.`userId`) and (`f0`.`usesDrizzleOrm` = ?))) limit ? offset ?",
			params: [1, true, 2, 4],
		});
	});

	it('relational query - table, nested + RAW where + limit + offset', ({ expect }) => {
		const query = rqbDb.query.users.findMany({
			where: { RAW: (t, { sql }) => sql`${t.id} > 1` },
			limit: 2,
			offset: 4,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true where `d0`.`id` > 1 limit ? offset ?",
			params: [1, 2, 4],
		});
	});

	it('relational query - schema table, deeply nested + orderBy + limit on every level', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({
			orderBy: { user_id: 'desc' },
			limit: 3,
			with: {
				projects: { orderBy: { project_name: 'asc' }, limit: 2, with: { developer: true } },
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from (select `d0`.* from `test`.`developers` as `d0` order by `d0`.`userId` desc limit ?) as `d0` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`, 'developer', `developer`)), json_array()) as `r` from (select `d1`.`id` as `id`, `d1`.`developerId` as `developer_id`, `d1`.`projectName` as `project_name`, `developer`.`r` as `developer`, row_number() over (order by `d1`.`projectName` asc) from (select `d1`.* from `projects` as `d1` where `d0`.`userId` = `d1`.`developerId` order by `d1`.`projectName` asc limit ?) as `d1` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d2`.`userId` as `user_id`, `d2`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d2` where `d1`.`developerId` = `d2`.`userId` limit ?) as `t`) as `developer` on true order by `d1`.`projectName` asc) as `t`) as `projects` on true order by `d0`.`userId` desc",
			params: [3, 2, 1],
		});
	});

	it('relational query - subquery, nested + orderBy + limit', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({
			orderBy: { role: 'asc' },
			limit: 2,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role`, `developers`.`r` as `developers` from (select `d0`.* from `staff_members` as `d0` order by `d0`.`user_role` asc limit ?) as `d0` left join lateral(select coalesce(json_arrayagg(json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`)), json_array()) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId`) as `t`) as `developers` on true order by `d0`.`user_role` asc",
			params: [2],
		});
	});

	it('relational query - basic strategy, table, nested + where + orderBy + limit + offset', ({ expect }) => {
		const query = rqbDb.query.users.findMany({
			strategy: 'basic',
			where: { first_name: { like: 'A%' }, developers: { uses_drizzle_orm: true } },
			orderBy: { first_name: 'asc' },
			limit: 2,
			offset: 4,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age`, `developers`.`r` as `developers` from `users` as `d0` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d1`.`userId` as `user_id`, `d1`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d1` where `d0`.`id` = `d1`.`userId` limit ?) as `t`) as `developers` on true where ((`d0`.`firstName` like ?) and (exists (select * from `test`.`developers` as `f0` where ((`d0`.`id` = `f0`.`userId`) and (`f0`.`usesDrizzleOrm` = ?))))) order by `d0`.`firstName` asc limit ? offset ?",
			params: [1, 'A%', true, 2, 4],
		});
	});

	it('relational query - basic strategy, schema table, deeply nested + orderBy + limit + offset on every level', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({
			strategy: 'basic',
			orderBy: { user_id: 'desc' },
			limit: 3,
			offset: 1,
			with: {
				projects: { orderBy: { project_name: 'asc' }, limit: 2, offset: 1, with: { developer: true } },
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from `test`.`developers` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`, 'developer', `developer`)), json_array()) as `r` from (select `d1`.`id` as `id`, `d1`.`developerId` as `developer_id`, `d1`.`projectName` as `project_name`, `developer`.`r` as `developer`, row_number() over (order by `d1`.`projectName` asc) from `projects` as `d1` left join lateral(select json_object('user_id', `user_id`, 'uses_drizzle_orm', `uses_drizzle_orm`) as `r` from (select `d2`.`userId` as `user_id`, `d2`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d2` where `d1`.`developerId` = `d2`.`userId` limit ?) as `t`) as `developer` on true where `d0`.`userId` = `d1`.`developerId` order by `d1`.`projectName` asc limit ? offset ?) as `t`) as `projects` on true order by `d0`.`userId` desc limit ? offset ?",
			params: [1, 2, 1, 3, 1],
		});
	});

	it('relational query - basic strategy, table, nested + orderBy relation + limit + offset (find first)', ({ expect }) => {
		const query = rqbDb.query.developers.findFirst({
			strategy: 'basic',
			orderBy: { projects: { id: 'desc(count)' }, user_id: 'asc' },
			offset: 1,
			with: { projects: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from `test`.`developers` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)), json_array()) as `r` from (select `d1`.`id` as `id`, `d1`.`developerId` as `developer_id`, `d1`.`projectName` as `project_name` from `projects` as `d1` where `d0`.`userId` = `d1`.`developerId`) as `t`) as `projects` on true order by (select count(`o0`.`id`) from `projects` as `o0` where `d0`.`userId` = `o0`.`developerId`) desc, `d0`.`userId` asc limit ? offset ?",
			params: [1, 1],
		});
	});

	it('relational query - table, orderBy field of a single relation', ({ expect }) => {
		const query = rqbDb.query.users.findMany({
			orderBy: { developers: { uses_drizzle_orm: 'desc' }, first_name: 'asc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`lastName` as `last_name`, `d0`.`AGE` as `age` from `users` as `d0` order by (select `o0`.`usesDrizzleOrm` from `test`.`developers` as `o0` where `d0`.`id` = `o0`.`userId` limit 1) desc, `d0`.`firstName` asc',
			params: [],
		});
	});

	it('relational query - table, orderBy aggregates of a many relation + limit + offset, nested', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({
			orderBy: { projects: { project_name: 'asc(min)', id: 'desc(count)' }, user_id: 'asc' },
			limit: 3,
			offset: 1,
			with: { projects: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from (select `d0`.* from `test`.`developers` as `d0` order by (select min(`o0`.`projectName`) from `projects` as `o0` where `d0`.`userId` = `o0`.`developerId`) asc, (select count(`o0`.`id`) from `projects` as `o0` where `d0`.`userId` = `o0`.`developerId`) desc, `d0`.`userId` asc limit ? offset ?) as `d0` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)), json_array()) as `r` from (select `d1`.`id` as `id`, `d1`.`developerId` as `developer_id`, `d1`.`projectName` as `project_name` from `projects` as `d1` where `d0`.`userId` = `d1`.`developerId`) as `t`) as `projects` on true order by (select min(`o0`.`projectName`) from `projects` as `o0` where `d0`.`userId` = `o0`.`developerId`) asc, (select count(`o0`.`id`) from `projects` as `o0` where `d0`.`userId` = `o0`.`developerId`) desc, `d0`.`userId` asc",
			params: [3, 1],
		});
	});

	it('relational query - table, orderBy first row of a many relation', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({
			orderBy: { projects: { project_name: 'desc(first)', developer: { user: { first_name: 'asc(first)' } } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d0` order by (select `o0`.`projectName` from `projects` as `o0` where `d0`.`userId` = `o0`.`developerId` limit 1) desc, (select `o2`.`firstName` from `projects` as `o0` cross join `test`.`developers` as `o1` cross join `users` as `o2` where ((`d0`.`userId` = `o0`.`developerId`) and (`o0`.`developerId` = `o1`.`userId`) and (`o1`.`userId` = `o2`.`id`)) limit 1) asc',
			params: [],
		});
	});

	it('relational query - table, orderBy number of rows of a many relation', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({
			orderBy: { projects: 'desc(count)', member: { developers: 'asc(count)' }, user_id: 'asc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d0` order by (select count(*) from `projects` as `o0` where `d0`.`userId` = `o0`.`developerId`) desc, (select count(*) from `staff_members` as `o0` cross join `test`.`developers` as `o1` where ((`d0`.`userId` = `o0`.`user_role`) and (`o0`.`id` = `o1`.`userId`))) asc, `d0`.`userId` asc',
			params: [],
		});
	});

	it('relational query - table, orderBy fields of nested relations', ({ expect }) => {
		const query = rqbDb.query.projects.findMany({
			orderBy: { developer: { user: { last_name: 'asc' }, projects: { project_name: 'desc(max)', id: 'asc(avg)' } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select `d0`.`id` as `id`, `d0`.`developerId` as `developer_id`, `d0`.`projectName` as `project_name` from `projects` as `d0` order by (select `o1`.`lastName` from `test`.`developers` as `o0` cross join `users` as `o1` where ((`d0`.`developerId` = `o0`.`userId`) and (`o0`.`userId` = `o1`.`id`)) limit 1) asc, (select max(`o1`.`projectName`) from `test`.`developers` as `o0` cross join `projects` as `o1` where ((`d0`.`developerId` = `o0`.`userId`) and (`o0`.`userId` = `o1`.`developerId`))) desc, (select avg(`o1`.`id`) from `test`.`developers` as `o0` cross join `projects` as `o1` where ((`d0`.`developerId` = `o0`.`userId`) and (`o0`.`userId` = `o1`.`developerId`))) asc',
			params: [],
		});
	});

	it('relational query - table, orderBy field of a subquery relation', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({
			orderBy: { member: { role: 'asc', first_name: 'desc' } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm` from `test`.`developers` as `d0` order by (select `o0`.`user_role` from `staff_members` as `o0` where `d0`.`userId` = `o0`.`user_role` limit 1) asc, (select `o0`.`firstName` from `staff_members` as `o0` where `d0`.`userId` = `o0`.`user_role` limit 1) desc',
			params: [],
		});
	});

	it('relational query - subquery, orderBy aggregate of a many relation', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({
			orderBy: { developers: { uses_drizzle_orm: 'desc(max)', user: { first_name: 'asc(min)' } }, role: 'desc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with `staff_members` as (select `id`, `firstName`, upper(`lastName`) as `user_role` from `users`) select cast(`d0`.`id` as char) as `id`, `d0`.`firstName` as `first_name`, `d0`.`user_role` as `role` from `staff_members` as `d0` order by (select max(`o0`.`usesDrizzleOrm`) from `test`.`developers` as `o0` where `d0`.`id` = `o0`.`userId`) desc, (select min(`o1`.`firstName`) from `test`.`developers` as `o0` cross join `users` as `o1` where ((`d0`.`id` = `o0`.`userId`) and (`o0`.`userId` = `o1`.`id`))) asc, `d0`.`user_role` desc',
			params: [],
		});
	});

	it('relational query - table, nested relation ordered by fields of its relations', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({
			with: {
				projects: {
					orderBy: { developer: { user: { first_name: 'desc' }, projects: { id: 'asc(count)' } }, id: 'asc' },
				},
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				"select cast(`d0`.`userId` as char) as `user_id`, `d0`.`usesDrizzleOrm` as `uses_drizzle_orm`, `projects`.`r` as `projects` from `test`.`developers` as `d0` left join lateral(select coalesce(json_arrayagg(json_object('id', `id`, 'developer_id', `developer_id`, 'project_name', `project_name`)), json_array()) as `r` from (select `d1`.`id` as `id`, `d1`.`developerId` as `developer_id`, `d1`.`projectName` as `project_name`, row_number() over (order by (select `o1`.`firstName` from `test`.`developers` as `o0` cross join `users` as `o1` where ((`d1`.`developerId` = `o0`.`userId`) and (`o0`.`userId` = `o1`.`id`)) limit 1) desc, (select count(`o1`.`id`) from `test`.`developers` as `o0` cross join `projects` as `o1` where ((`d1`.`developerId` = `o0`.`userId`) and (`o0`.`userId` = `o1`.`developerId`))) asc, `d1`.`id` asc) from `projects` as `d1` where `d0`.`userId` = `d1`.`developerId` order by (select `o1`.`firstName` from `test`.`developers` as `o0` cross join `users` as `o1` where ((`d1`.`developerId` = `o0`.`userId`) and (`o0`.`userId` = `o1`.`id`)) limit 1) desc, (select count(`o1`.`id`) from `test`.`developers` as `o0` cross join `projects` as `o1` where ((`d1`.`developerId` = `o0`.`userId`) and (`o0`.`userId` = `o1`.`developerId`))) asc, `d1`.`id` asc) as `t`) as `projects` on true",
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

	it('set operator - order by leaves passed sql intact', ({ expect }) => {
		const order = desc(users.first_name);
		const query = db
			.select({ first_name: users.first_name })
			.from(users)
			.union(db.select({ first_name: users.first_name }).from(users))
			.orderBy(order);

		expect(query.toSQL().sql).toBe(
			'select `firstName` from ((select `firstName` from `users`) union (select `firstName` from `users`) order by `firstName` desc) `drizzle_union`',
		);
		// Same SQL objects keep their qualifiers in other queries
		expect(db.select({ first_name: users.first_name }).from(users).orderBy(order).toSQL().sql).toBe(
			'select `firstName` from `users` order by `users`.`firstName` desc',
		);
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

	it('insert (column selection) with select', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name')
			.select(db.select({ first_name: users.first_name, last_name: users.last_name }).from(users));

		expect(query.toSQL()).toEqual({
			sql: 'insert into `users` (`firstName`, `lastName`) select `firstName`, `lastName` from `users`',
			params: [],
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
		const castCodecs = { ...tidbCodecs, int: { ...tidbCodecs.int, cast: castToText } };
		const castDb = mysql({ client: connect({}), codecs: castCodecs });
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

		it('Queries in operators ignore casts', ({ expect }) => {
			const inner = () => castDb.select({ cast_value: casts.cast_value }).from(casts);

			expect(castDb.select({ x: casts.cast_value }).from(casts).where(eq(casts.cast_value, inner())).toSQL().sql)
				.toEqual(
					'select cast(`castValue` as char) from `casts` where `casts`.`castValue` = (select `castValue` from `casts`)',
				);
			expect(castDb.select({ x: casts.cast_value }).from(casts).where(inArray(casts.cast_value, inner())).toSQL().sql)
				.toEqual(
					'select cast(`castValue` as char) from `casts` where `casts`.`castValue` in (select `castValue` from `casts`)',
				);
			expect(castDb.select({ x: casts.cast_value }).from(casts).where(exists(inner())).toSQL().sql)
				.toEqual('select cast(`castValue` as char) from `casts` where exists (select `castValue` from `casts`)');
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

	describe('param casts', () => {
		const paramCodecs = {
			...tidbCodecs,
			int: {
				...tidbCodecs.int,
				castParam: (name: string) => `cast(${name} as signed)`,
				normalizeParam: (value: number) => value * 10,
			},
		};
		const paramDb = mysql({ client: connect({}), codecs: paramCodecs });
		const paramValues = camelCase.table('params', { param_value: int() });

		it('Param codecs are applied to bound params', ({ expect }) => {
			expect(paramDb.select().from(paramValues).where(eq(paramValues.param_value, 1)).toSQL()).toEqual({
				sql: 'select `paramValue` from `params` where `params`.`paramValue` = cast(? as signed)',
				params: [10],
			});
		});

		it(`castParam isn't applied to inlined params`, ({ expect }) => {
			const query = paramDb.select().from(paramValues).where(eq(paramValues.param_value, 1).inlineParams()).toSQL();

			expect(query).toEqual({
				sql: 'select `paramValue` from `params` where `params`.`paramValue` = 1',
				params: [],
			});
			expect(query.sql).not.toContain('cast(');
		});

		it(`normalizeParam isn't applied to inlined params`, ({ expect }) => {
			const query = paramDb.select().from(paramValues).where(eq(paramValues.param_value, 7).inlineParams()).toSQL();

			expect(query).toEqual({
				sql: 'select `paramValue` from `params` where `params`.`paramValue` = 7',
				params: [],
			});

			expect(query.sql).not.toContain('70');
		});

		it('Placeholder params are still cast when params are inlined', ({ expect }) => {
			const placeholder = new Param(sql.placeholder('value'), paramValues.param_value);
			const query = paramDb
				.select()
				.from(paramValues)
				.where(sql`${paramValues.param_value} = ${placeholder}`.inlineParams())
				.toSQL();

			expect(query.sql).toEqual('select `paramValue` from `params` where `params`.`paramValue` = cast(? as signed)');
		});
	});
});
