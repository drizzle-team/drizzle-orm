import { describe, it } from 'vitest';
import { drizzle, nodeCockroachCodecs } from '~/cockroach';
import { alias, boolean, castToText, int4, QueryBuilder, snakeCase, text, union } from '~/cockroach-core';
import { defineRelations } from '~/relations';
import { asc, desc, eq, exists, inArray, Param, sql } from '~/sql';

const testSchema = snakeCase.schema('test');
const users = snakeCase.table('users', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	firstName: text().notNull(),
	lastName: text().notNull(),
	// Test that custom aliases remain
	age: int4('AGE'),
});
const developers = testSchema.table('developers', {
	userId: int4().primaryKey().generatedByDefaultAsIdentity().references(() => users.id),
	usesDrizzleORM: boolean().notNull(),
});
const devs = alias(developers, 'devs');

const projects = snakeCase.table('projects', {
	id: int4().primaryKey(),
	developerId: int4(),
	projectName: text(),
});

const usersView = snakeCase.view('users_view').as((qb) =>
	qb.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users)
);

const staff = new QueryBuilder().select({
	id: users.id,
	firstName: users.firstName,
	role: sql<string>`upper(${users.lastName})`.as('user_role'),
}).from(users).as('staff_members');

const relations = defineRelations({ users, developers, projects, staff, usersView }, (r) => ({
	users: {
		developers: r.one.developers({ from: r.users.id, to: r.developers.userId }),
	},
	developers: {
		user: r.one.users({ from: r.developers.userId, to: r.users.id }),
		projects: r.many.projects({ from: r.developers.userId, to: r.projects.developerId }),
		member: r.one.staff({ from: r.developers.userId, to: r.staff.role }),
		viewUser: r.one.usersView({ from: r.developers.userId, to: r.usersView.id }),
	},
	projects: {
		developer: r.one.developers({ from: r.projects.developerId, to: r.developers.userId }),
	},
	staff: {
		developers: r.many.developers({ from: r.staff.id, to: r.developers.userId }),
	},
	usersView: {
		developers: r.many.developers({ from: r.usersView.id, to: r.developers.userId }),
	},
}));

const db = drizzle.mock({ relations });

const fullName = sql`${users.firstName} || ' ' || ${users.lastName}`.as('name');

describe('cockroach to snake case', () => {
	it('unicode column names', ({ expect }) => {
		const unicode = snakeCase.table('unicode', {
			칼럼명: text(),
		});

		expect(db.select().from(unicode).toSQL().sql).toEqual(
			'select "칼럼명" from "unicode"',
		);
	});

	it('qualifier preservation for sql fields', ({ expect }) => {
		const a = snakeCase.table('a', { id: int4('id').primaryKey(), cId: int4().notNull() });
		const b = snakeCase.table('b', { id: int4('id').primaryKey(), cId: int4().notNull(), label: text() });
		const corr = sql`(select ${b.label} from ${b} where ${b.cId} = ${a.cId})`;

		expect(db.select({ id: a.id, bRaw: corr }).from(a).toSQL().sql).toEqual(
			'select "id", (select "b"."label" from "b" where "b"."c_id" = "a"."c_id") from "a"',
		);
		expect(db.select({ id: a.id, bRaw: corr.as('b_raw') }).from(a).toSQL().sql).toEqual(
			'select "id", (select "b"."label" from "b" where "b"."c_id" = "a"."c_id") as "b_raw" from "a"',
		);
		expect(db.select({ id: a.id }).from(a).where(corr).toSQL().sql).toEqual(
			'select "id" from "a" where (select "b"."label" from "b" where "b"."c_id" = "a"."c_id")',
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
				'select "sq"."id", "sq"."name" from "users" left join (select "id", "first_name" || \' \' || "last_name" as "name" from "users") "sq" on "users"."id" = "sq"."id"',
			params: [],
		});
	});

	it('relational query over a subquery source', ({ expect }) => {
		const query = db.query.staff.findMany({
			columns: { id: true, role: true },
			where: { role: { like: 'A%' } },
			orderBy: { firstName: 'asc' },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."user_role" as "role", "developers"."r" as "developers" from "staff_members" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id") as "t") as "developers" on true where "d0"."user_role" like $1 order by "d0"."first_name" asc',
			params: ['A%'],
		});
	});

	it("relational query joining on a subquery's aliased sql field", ({ expect }) => {
		const query = db.query.developers.findMany({ with: { member: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM", "member"."r" as "member" from "test"."developers" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."id" as "id", "d1"."first_name" as "firstName", "d1"."user_role" as "role" from "staff_members" as "d1" where "d0"."user_id" = "d1"."user_role" limit $1) as "t") as "member" on true',
			params: [1],
		});
	});

	it('relational query - table, single level (find many)', ({ expect }) => {
		const query = db.query.users.findMany({});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age" from "users" as "d0"',
			params: [],
		});
	});

	it('relational query - table, single level (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age" from "users" as "d0" limit $1',
			params: [1],
		});
	});

	it('relational query - table, nested (find many)', ({ expect }) => {
		const query = db.query.users.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $1) as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - table, nested (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" limit $1) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $2) as "t") as "developers" on true',
			params: [1, 1],
		});
	});

	it('relational query - table, deeply nested (find many)', ({ expect }) => {
		const query = db.query.users.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developer_id" as "developerId", "d2"."project_name" as "projectName" from "projects" as "d2" where "d1"."user_id" = "d2"."developer_id") as "t") as "projects" on true where "d0"."id" = "d1"."user_id" limit $1) as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - table, deeply nested (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" limit $1) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developer_id" as "developerId", "d2"."project_name" as "projectName" from "projects" as "d2" where "d1"."user_id" = "d2"."developer_id") as "t") as "projects" on true where "d0"."id" = "d1"."user_id" limit $2) as "t") as "developers" on true',
			params: [1, 1],
		});
	});

	it('relational query - view, single level (find first)', ({ expect }) => {
		const query = db.query.usersView.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName" from "users_view" as "d0" limit $1',
			params: [1],
		});
	});

	it('relational query - view, nested (find many)', ({ expect }) => {
		const query = db.query.usersView.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "developers"."r" as "developers" from "users_view" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id") as "t") as "developers" on true',
			params: [],
		});
	});

	it('relational query - mixed table -> table -> view (find many)', ({ expect }) => {
		const query = db.query.projects.findMany({
			with: { developer: { with: { viewUser: true, member: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."developer_id" as "developerId", "d0"."project_name" as "projectName", "developer"."r" as "developer" from "projects" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM", "viewUser"."r" as "viewUser", "member"."r" as "member" from "test"."developers" as "d1" left join lateral(select row_to_json("t".*) "r" from (select "d2"."id" as "id", "d2"."first_name" as "firstName", "d2"."last_name" as "lastName" from "users_view" as "d2" where "d1"."user_id" = "d2"."id" limit $1) as "t") as "viewUser" on true left join lateral(select row_to_json("t".*) "r" from (select "d2"."id" as "id", "d2"."first_name" as "firstName", "d2"."user_role" as "role" from "staff_members" as "d2" where "d1"."user_id" = "d2"."user_role" limit $2) as "t") as "member" on true where "d0"."developer_id" = "d1"."user_id" limit $3) as "t") as "developer" on true',
			params: [1, 1, 1],
		});
	});

	it('relational query - mixed view -> table -> table (find first)', ({ expect }) => {
		const query = db.query.usersView.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "developers"."r" as "developers" from (select "d0".* from "users_view" as "d0" limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developer_id" as "developerId", "d2"."project_name" as "projectName" from "projects" as "d2" where "d1"."user_id" = "d2"."developer_id") as "t") as "projects" on true where "d0"."id" = "d1"."user_id") as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - subquery, single level (find many)', ({ expect }) => {
		const query = db.query.staff.findMany({});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role" from "staff_members" as "d0"',
			params: [],
		});
	});

	it('relational query - subquery, single level (find first)', ({ expect }) => {
		const query = db.query.staff.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role" from "staff_members" as "d0" limit $1',
			params: [1],
		});
	});

	it('relational query - subquery, nested (find many)', ({ expect }) => {
		const query = db.query.staff.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role", "developers"."r" as "developers" from "staff_members" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id") as "t") as "developers" on true',
			params: [],
		});
	});

	it('relational query - subquery, nested (find first)', ({ expect }) => {
		const query = db.query.staff.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role", "developers"."r" as "developers" from (select "d0".* from "staff_members" as "d0" limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id") as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - subquery, deeply nested (find many)', ({ expect }) => {
		const query = db.query.staff.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role", "developers"."r" as "developers" from "staff_members" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developer_id" as "developerId", "d2"."project_name" as "projectName" from "projects" as "d2" where "d1"."user_id" = "d2"."developer_id") as "t") as "projects" on true where "d0"."id" = "d1"."user_id") as "t") as "developers" on true',
			params: [],
		});
	});

	it('relational query - subquery, deeply nested (find first)', ({ expect }) => {
		const query = db.query.staff.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role", "developers"."r" as "developers" from (select "d0".* from "staff_members" as "d0" limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developer_id" as "developerId", "d2"."project_name" as "projectName" from "projects" as "d2" where "d1"."user_id" = "d2"."developer_id") as "t") as "projects" on true where "d0"."id" = "d1"."user_id") as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - mixed table -> subquery -> table (find many)', ({ expect }) => {
		const query = db.query.developers.findMany({ with: { member: { with: { developers: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM", "member"."r" as "member" from "test"."developers" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."id" as "id", "d1"."first_name" as "firstName", "d1"."user_role" as "role", "developers"."r" as "developers" from "staff_members" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."user_id" as "userId", "d2"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d2" where "d1"."id" = "d2"."user_id") as "t") as "developers" on true where "d0"."user_id" = "d1"."user_role" limit $1) as "t") as "member" on true',
			params: [1],
		});
	});

	it('relational query - mixed subquery -> table -> view (find first)', ({ expect }) => {
		const query = db.query.staff.findFirst({
			with: { developers: { with: { viewUser: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role", "developers"."r" as "developers" from (select "d0".* from "staff_members" as "d0" limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM", "viewUser"."r" as "viewUser" from "test"."developers" as "d1" left join lateral(select row_to_json("t".*) "r" from (select "d2"."id" as "id", "d2"."first_name" as "firstName", "d2"."last_name" as "lastName" from "users_view" as "d2" where "d1"."user_id" = "d2"."id" limit $2) as "t") as "viewUser" on true where "d0"."id" = "d1"."user_id") as "t") as "developers" on true',
			params: [1, 1],
		});
	});

	it('relational query - table, nested + orderBy + limit', ({ expect }) => {
		const query = db.query.users.findMany({
			orderBy: { firstName: 'asc' },
			limit: 2,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" order by "d0"."first_name" asc limit $1) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $2) as "t") as "developers" on true order by "d0"."first_name" asc',
			params: [2, 1],
		});
	});

	it('relational query - table, nested + limit + offset', ({ expect }) => {
		const query = db.query.users.findMany({ limit: 2, offset: 4, with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" limit $1 offset $2) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $3) as "t") as "developers" on true',
			params: [2, 4, 1],
		});
	});

	it('relational query - table, nested + limit', ({ expect }) => {
		const query = db.query.users.findMany({
			limit: 2,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" limit $1) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $2) as "t") as "developers" on true',
			params: [2, 1],
		});
	});

	it('relational query - table, nested + where', ({ expect }) => {
		const query = db.query.users.findMany({
			where: { firstName: { like: 'A%' } },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $1) as "t") as "developers" on true where "d0"."first_name" like $2',
			params: [1, 'A%'],
		});
	});

	it('relational query - table, nested + relation where', ({ expect }) => {
		const query = db.query.users.findMany({
			where: { developers: { usesDrizzleORM: true } },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $1) as "t") as "developers" on true where exists (select * from "test"."developers" as "f0" where (("d0"."id" = "f0"."user_id") and ("f0"."uses_drizzle_orm" = $2)))',
			params: [1, true],
		});
	});

	it('relational query - table, nested + relation where + limit', ({ expect }) => {
		const query = db.query.users.findMany({
			where: { developers: { usesDrizzleORM: true } },
			limit: 2,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" where exists (select * from "test"."developers" as "f0" where (("d0"."id" = "f0"."user_id") and ("f0"."uses_drizzle_orm" = $1))) limit $2) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $3) as "t") as "developers" on true',
			params: [true, 2, 1],
		});
	});

	it('relational query - table, nested + where + orderBy', ({ expect }) => {
		const query = db.query.users.findMany({
			where: { firstName: { like: 'A%' } },
			orderBy: { firstName: 'asc' },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $1) as "t") as "developers" on true where "d0"."first_name" like $2 order by "d0"."first_name" asc',
			params: [1, 'A%'],
		});
	});

	it('relational query - schema table, deeply nested + orderBy + limit on every level', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { userId: 'desc' },
			limit: 3,
			with: {
				projects: { orderBy: { projectName: 'asc' }, limit: 2, with: { developer: true } },
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from (select "d0".* from "test"."developers" as "d0" order by "d0"."user_id" desc limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developer_id" as "developerId", "d1"."project_name" as "projectName", "developer"."r" as "developer" from (select "d1".* from "projects" as "d1" where "d0"."user_id" = "d1"."developer_id" order by "d1"."project_name" asc limit $2) as "d1" left join lateral(select row_to_json("t".*) "r" from (select "d2"."user_id" as "userId", "d2"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d2" where "d1"."developer_id" = "d2"."user_id" limit $3) as "t") as "developer" on true order by "d1"."project_name" asc) as "t") as "projects" on true order by "d0"."user_id" desc',
			params: [3, 2, 1],
		});
	});

	it('relational query - subquery, nested + orderBy + limit', ({ expect }) => {
		const query = db.query.staff.findMany({
			orderBy: { role: 'asc' },
			limit: 2,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role", "developers"."r" as "developers" from (select "d0".* from "staff_members" as "d0" order by "d0"."user_role" asc limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id") as "t") as "developers" on true order by "d0"."user_role" asc',
			params: [2],
		});
	});

	it('relational query - basic strategy, table, nested + where + orderBy + limit + offset', ({ expect }) => {
		const query = db.query.users.findMany({
			strategy: 'basic',
			where: { firstName: { like: 'A%' }, developers: { usesDrizzleORM: true } },
			orderBy: { firstName: 'asc' },
			limit: 2,
			offset: 4,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."user_id" as "userId", "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $1) as "t") as "developers" on true where (("d0"."first_name" like $2) and (exists (select * from "test"."developers" as "f0" where (("d0"."id" = "f0"."user_id") and ("f0"."uses_drizzle_orm" = $3))))) order by "d0"."first_name" asc limit $4 offset $5',
			params: [1, 'A%', true, 2, 4],
		});
	});

	it('relational query - basic strategy, schema table, deeply nested + orderBy + limit + offset on every level', ({ expect }) => {
		const query = db.query.developers.findMany({
			strategy: 'basic',
			orderBy: { userId: 'desc' },
			limit: 3,
			offset: 1,
			with: {
				projects: { orderBy: { projectName: 'asc' }, limit: 2, offset: 1, with: { developer: true } },
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from "test"."developers" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developer_id" as "developerId", "d1"."project_name" as "projectName", "developer"."r" as "developer" from "projects" as "d1" left join lateral(select row_to_json("t".*) "r" from (select "d2"."user_id" as "userId", "d2"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d2" where "d1"."developer_id" = "d2"."user_id" limit $1) as "t") as "developer" on true where "d0"."user_id" = "d1"."developer_id" order by "d1"."project_name" asc limit $2 offset $3) as "t") as "projects" on true order by "d0"."user_id" desc limit $4 offset $5',
			params: [1, 2, 1, 3, 1],
		});
	});

	it('relational query - basic strategy, table, nested + orderBy relation + limit + offset (find first)', ({ expect }) => {
		const query = db.query.developers.findFirst({
			strategy: 'basic',
			orderBy: { projects: { id: 'desc(count)' }, userId: 'asc' },
			offset: 1,
			with: { projects: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from "test"."developers" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developer_id" as "developerId", "d1"."project_name" as "projectName" from "projects" as "d1" where "d0"."user_id" = "d1"."developer_id") as "t") as "projects" on true order by (select count("o0"."id") from "projects" as "o0" where "d0"."user_id" = "o0"."developer_id") desc, "d0"."user_id" asc limit $1 offset $2',
			params: [1, 1],
		});
	});

	it('relational query - table, orderBy field of a single relation', ({ expect }) => {
		const query = db.query.users.findMany({
			orderBy: { developers: { usesDrizzleORM: 'desc' }, firstName: 'asc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."AGE" as "age" from "users" as "d0" order by (select "o0"."uses_drizzle_orm" from "test"."developers" as "o0" where "d0"."id" = "o0"."user_id" limit 1) desc, "d0"."first_name" asc',
			params: [],
		});
	});

	it('relational query - table, orderBy aggregates of a many relation + limit + offset, nested', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { projects: { projectName: 'asc(min)', id: 'desc(count)' }, userId: 'asc' },
			limit: 3,
			offset: 1,
			with: { projects: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from (select "d0".* from "test"."developers" as "d0" order by (select min("o0"."project_name") from "projects" as "o0" where "d0"."user_id" = "o0"."developer_id") asc, (select count("o0"."id") from "projects" as "o0" where "d0"."user_id" = "o0"."developer_id") desc, "d0"."user_id" asc limit $1 offset $2) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developer_id" as "developerId", "d1"."project_name" as "projectName" from "projects" as "d1" where "d0"."user_id" = "d1"."developer_id") as "t") as "projects" on true order by (select min("o0"."project_name") from "projects" as "o0" where "d0"."user_id" = "o0"."developer_id") asc, (select count("o0"."id") from "projects" as "o0" where "d0"."user_id" = "o0"."developer_id") desc, "d0"."user_id" asc',
			params: [3, 1],
		});
	});

	it('relational query - table, orderBy first row of a many relation', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { projects: { projectName: 'desc(first)', developer: { user: { firstName: 'asc(first)' } } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d0" order by (select "o0"."project_name" from "projects" as "o0" where "d0"."user_id" = "o0"."developer_id" limit 1) desc, (select "o2"."first_name" from "projects" as "o0" cross join "test"."developers" as "o1" cross join "users" as "o2" where (("d0"."user_id" = "o0"."developer_id") and ("o0"."developer_id" = "o1"."user_id") and ("o1"."user_id" = "o2"."id")) limit 1) asc',
			params: [],
		});
	});

	it('relational query - table, orderBy number of rows of a many relation', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { projects: 'desc(count)', member: { developers: 'asc(count)' }, userId: 'asc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d0" order by (select count(*) from "projects" as "o0" where "d0"."user_id" = "o0"."developer_id") desc, (select count(*) from "staff_members" as "o0" cross join "test"."developers" as "o1" where (("d0"."user_id" = "o0"."user_role") and ("o0"."id" = "o1"."user_id"))) asc, "d0"."user_id" asc',
			params: [],
		});
	});

	it('relational query - table, orderBy fields of nested relations', ({ expect }) => {
		const query = db.query.projects.findMany({
			orderBy: { developer: { user: { lastName: 'asc' }, projects: { projectName: 'desc(max)', id: 'asc(avg)' } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."developer_id" as "developerId", "d0"."project_name" as "projectName" from "projects" as "d0" order by (select "o1"."last_name" from "test"."developers" as "o0" cross join "users" as "o1" where (("d0"."developer_id" = "o0"."user_id") and ("o0"."user_id" = "o1"."id")) limit 1) asc, (select max("o1"."project_name") from "test"."developers" as "o0" cross join "projects" as "o1" where (("d0"."developer_id" = "o0"."user_id") and ("o0"."user_id" = "o1"."developer_id"))) desc, (select avg("o1"."id") from "test"."developers" as "o0" cross join "projects" as "o1" where (("d0"."developer_id" = "o0"."user_id") and ("o0"."user_id" = "o1"."developer_id"))) asc',
			params: [],
		});
	});

	it('relational query - table, orderBy field of a subquery relation', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { member: { role: 'asc', firstName: 'desc' } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d0" order by (select "o0"."user_role" from "staff_members" as "o0" where "d0"."user_id" = "o0"."user_role" limit 1) asc, (select "o0"."first_name" from "staff_members" as "o0" where "d0"."user_id" = "o0"."user_role" limit 1) desc',
			params: [],
		});
	});

	it('relational query - subquery, orderBy aggregate of a many relation', ({ expect }) => {
		const query = db.query.staff.findMany({
			orderBy: { developers: { usesDrizzleORM: 'desc(max)', user: { firstName: 'asc(min)' } }, role: 'desc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "first_name", upper("last_name") as "user_role" from "users") select "d0"."id" as "id", "d0"."first_name" as "firstName", "d0"."user_role" as "role" from "staff_members" as "d0" order by (select max("o0"."uses_drizzle_orm") from "test"."developers" as "o0" where "d0"."id" = "o0"."user_id") desc, (select min("o1"."first_name") from "test"."developers" as "o0" cross join "users" as "o1" where (("d0"."id" = "o0"."user_id") and ("o0"."user_id" = "o1"."id"))) asc, "d0"."user_role" desc',
			params: [],
		});
	});

	it('relational query - table, nested relation ordered by fields of its relations', ({ expect }) => {
		const query = db.query.developers.findMany({
			with: {
				projects: {
					orderBy: { developer: { user: { firstName: 'desc' }, projects: { id: 'asc(count)' } }, id: 'asc' },
				},
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."user_id" as "userId", "d0"."uses_drizzle_orm" as "usesDrizzleORM", "projects"."r" as "projects" from "test"."developers" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developer_id" as "developerId", "d1"."project_name" as "projectName" from "projects" as "d1" where "d0"."user_id" = "d1"."developer_id" order by (select "o1"."first_name" from "test"."developers" as "o0" cross join "users" as "o1" where (("d1"."developer_id" = "o0"."user_id") and ("o0"."user_id" = "o1"."id")) limit 1) desc, (select count("o1"."id") from "test"."developers" as "o0" cross join "projects" as "o1" where (("d1"."developer_id" = "o0"."user_id") and ("o0"."user_id" = "o1"."developer_id"))) asc, "d1"."id" asc) as "t") as "projects" on true',
			params: [],
		});
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
	});

	it('with CTE', ({ expect }) => {
		const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql:
				'with "cte" as (select "first_name" || \' \' || "last_name" as "name" from "users") select "name" from "cte"',
			params: [],
		});
	});

	it('with CTE (with query builder)', ({ expect }) => {
		const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql:
				'with "cte" as (select "first_name" || \' \' || "last_name" as "name" from "users") select "name" from "cte"',
			params: [],
		});
	});

	it('set operator', ({ expect }) => {
		const query = db
			.select({ firstName: users.firstName })
			.from(users)
			.union(db.select({ firstName: users.firstName }).from(users));

		expect(query.toSQL()).toEqual({
			sql:
				'select "first_name" from ((select "first_name" from "users") union (select "first_name" from "users")) "drizzle_union"',
			params: [],
		});
	});

	it('set operator (function)', ({ expect }) => {
		const query = union(
			db.select({ firstName: users.firstName }).from(users),
			db.select({ firstName: users.firstName }).from(users),
		);

		expect(query.toSQL()).toEqual({
			sql:
				'select "first_name" from ((select "first_name" from "users") union (select "first_name" from "users")) "drizzle_union"',
			params: [],
		});
	});

	it('set operator - order by leaves passed sql intact', ({ expect }) => {
		const order = desc(users.firstName);
		const query = db
			.select({ firstName: users.firstName })
			.from(users)
			.union(db.select({ firstName: users.firstName }).from(users))
			.orderBy(order);

		expect(query.toSQL().sql).toBe(
			'select "first_name" from ((select "first_name" from "users") union (select "first_name" from "users")) "drizzle_union" order by "first_name" desc',
		);
		// Same SQL objects keep their qualifiers in other queries
		expect(db.select({ firstName: users.firstName }).from(users).orderBy(order).toSQL().sql).toBe(
			'select "first_name" from "users" order by "users"."first_name" desc',
		);
	});

	it('query (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({
			columns: {
				id: true,
				age: true,
			},
			extras: {
				fullName: ({ firstName, lastName }) => sql`${firstName} || ' ' || ${lastName}`.as('name'),
			},
			where: { id: 1 },
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
				'select "d0"."id" as "id", "d0"."AGE" as "age", ("d0"."first_name" || \' \' || "d0"."last_name") as "fullName", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" where "d0"."id" = $1 limit $2) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $3) as "t") as "developers" on true',
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
				fullName: ({ firstName, lastName }) => sql`${firstName} || ' ' || ${lastName}`.as('name'),
			},
			where: { id: 1 },
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
				'select "d0"."id" as "id", "d0"."AGE" as "age", ("d0"."first_name" || \' \' || "d0"."last_name") as "fullName", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."uses_drizzle_orm" as "usesDrizzleORM" from "test"."developers" as "d1" where "d0"."id" = "d1"."user_id" limit $1) as "t") as "developers" on true where "d0"."id" = $2',
			params: [1, 1],
		});
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
	});

	it('insert (column selection)', ({ expect }) => {
		const query = db
			.insert(users, 'firstName', 'lastName', 'age')
			.values({ firstName: 'John', lastName: 'Doe', age: 30 })
			.returning({ firstName: users.firstName, age: users.age });

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("first_name", "last_name", "AGE") values ($1, $2, $3) returning "first_name", "AGE"',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (column selection, multiple rows)', ({ expect }) => {
		const query = db
			.insert(users, 'firstName', 'lastName')
			.values([{ firstName: 'John', lastName: 'Doe' }, { firstName: 'Jane', lastName: 'Roe' }]);

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("first_name", "last_name") values ($1, $2), ($3, $4)',
			params: ['John', 'Doe', 'Jane', 'Roe'],
		});
	});

	it('insert (column selection, omitted optional column)', ({ expect }) => {
		const query = db
			.insert(users, 'firstName', 'lastName', 'age')
			.values({ firstName: 'John', lastName: 'Doe' });

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("first_name", "last_name", "AGE") values ($1, $2, default)',
			params: ['John', 'Doe'],
		});
	});

	it('insert (column selection) with select', ({ expect }) => {
		const query = db
			.insert(users, 'firstName', 'lastName')
			.select(db.select({ firstName: users.firstName, lastName: users.lastName }).from(users));

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("first_name", "last_name") select "first_name", "last_name" from "users"',
			params: [],
		});
	});

	it('insert (column selection) emits columns in list order', ({ expect }) => {
		const query = db
			.insert(users, 'age', 'lastName', 'firstName')
			.values({ firstName: 'John', lastName: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("AGE", "last_name", "first_name") values ($1, $2, $3)',
			params: [30, 'Doe', 'John'],
		});
	});

	it('insert (column selection) on conflict do update', ({ expect }) => {
		const query = db
			.insert(users, 'firstName', 'lastName', 'age')
			.values({ firstName: 'John', lastName: 'Doe', age: 30 })
			.onConflictDoUpdate({ target: users.firstName, set: { age: 31 } })
			.returning({ firstName: users.firstName, age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("first_name", "last_name", "AGE") values ($1, $2, $3) on conflict ("first_name") do update set "AGE" = $4 returning "first_name", "AGE"',
			params: ['John', 'Doe', 30, 31],
		});
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
			.leftJoin(developers, eq(users.id.as('userId'), developers.userId))
			.orderBy(asc(users.firstName));

		expect(query.toSQL()).toEqual({
			sql:
				'select "users"."first_name" || \' \' || "users"."last_name" as "name", "users"."AGE" as "ageOfUser", "users"."id" as "userId" from "users" left join "test"."developers" on "userId" = "test"."developers"."user_id" order by "users"."first_name" asc',
			params: [],
		});
	});

	it('insert (on conflict do update) returning as', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ firstName: 'John', lastName: 'Doe', age: 30 })
			.onConflictDoUpdate({ target: users.firstName.as('userFirstName'), set: { age: 31 } })
			.returning({ firstName: users.firstName, age: users.age.as('userAge') });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("id", "first_name", "last_name", "AGE") values (default, $1, $2, $3) on conflict ("userFirstName") do update set "AGE" = $4 returning "first_name", "AGE" as "userAge"',
			params: ['John', 'Doe', 30, 31],
		});
	});

	it('update returning as', ({ expect }) => {
		const query = db
			.update(users)
			.set({ firstName: 'John', lastName: 'Doe', age: 30 })
			.where(eq(users.id, 1))
			.returning({ firstName: users.firstName.as('usersName'), age: users.age });

		expect(query.toSQL()).toEqual({
			sql:
				'update "users" set "first_name" = $1, "last_name" = $2, "AGE" = $3 where "users"."id" = $4 returning "first_name" as "usersName", "AGE"',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete returning as', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1))
			.returning({ firstName: users.firstName, age: users.age.as('usersAge') });

		expect(query.toSQL()).toEqual({
			sql: 'delete from "users" where "users"."id" = $1 returning "first_name", "AGE" as "usersAge"',
			params: [1],
		});
	});

	describe('selection casts', () => {
		const castCodecs = { ...nodeCockroachCodecs, int4: { ...nodeCockroachCodecs.int4, cast: castToText } };
		const castDb = drizzle.mock({ codecs: castCodecs });
		const casts = snakeCase.table('casts', { castValue: int4() });
		const castTargets = snakeCase.table('cast_targets', { targetId: text() });
		const castSubquery = () => castDb.select({ castValue: casts.castValue }).from(casts).as('sq');

		it(`Cast respects alias config`, ({ expect }) => {
			expect(castDb.select({ c: casts.castValue }).from(casts).toSQL().sql).toEqual(
				'select "cast_value"::text from "casts"',
			);
			expect(castDb.select({ c: casts.castValue.as('alias') }).from(casts).toSQL().sql).toEqual(
				'select "cast_value"::text as "alias" from "casts"',
			);
		});

		it(`Cast applied to selected subquery depending on it's selection`, ({ expect }) => {
			expect(castDb.select({ x: castSubquery() }).from(castTargets).toSQL().sql).toEqual(
				'select (select "cast_value" from "casts")::text "sq" from "cast_targets"',
			);
		});

		it('Nested queries ignore casts', ({ expect }) => {
			const outer = castDb.select({ x: castSubquery() }).from(castTargets).as('outer');

			expect(castDb.select().from(outer).toSQL().sql).toEqual(
				'select (select "cast_value" from "casts")::text "sq" from (select (select "cast_value" from "casts") "sq" from "cast_targets") "outer"',
			);
		});

		it('Queries in operators ignore casts', ({ expect }) => {
			const inner = () => castDb.select({ castValue: casts.castValue }).from(casts);

			expect(castDb.select({ x: casts.castValue }).from(casts).where(eq(casts.castValue, inner())).toSQL().sql)
				.toEqual(
					'select "cast_value"::text from "casts" where "casts"."cast_value" = (select "cast_value" from "casts")',
				);
			expect(castDb.select({ x: casts.castValue }).from(casts).where(inArray(casts.castValue, inner())).toSQL().sql)
				.toEqual(
					'select "cast_value"::text from "casts" where "casts"."cast_value" in (select "cast_value" from "casts")',
				);
			expect(castDb.select({ x: casts.castValue }).from(casts).where(exists(inner())).toSQL().sql)
				.toEqual('select "cast_value"::text from "casts" where exists (select "cast_value" from "casts")');
		});

		it(`Column as decoder applies cast`, ({ expect }) => {
			expect(
				castDb.select({
					x: sql`${casts.castValue}`.mapWith(casts.castValue),
					y: sql`${casts.castValue}`.mapWith(casts.castValue).as('y'),
				}).from(casts).toSQL().sql,
			)
				.toEqual('select "cast_value"::text, "cast_value"::text as "y" from "casts"');
		});

		it(`Cast doesn't bleed params into selection`, ({ expect }) => {
			// Regression test for pre-existing issue
			const query = castDb.select({ x: castSubquery() }).from(castTargets).toSQL();

			expect(query.params).toEqual([]);
			expect(query.sql).not.toMatch(/\$\d|\?|@par/);
		});

		it(`No double spaces in union's 'order by' `, ({ expect }) => {
			const branch = () => castDb.select({ x: casts.castValue }).from(casts);
			const query = branch()
				.unionAll(branch())
				.orderBy(sql`1`)
				.limit(3);

			expect(query.toSQL().sql).toEqual(
				'select "cast_value"::text from ((select "cast_value" from "casts") union all (select "cast_value" from "casts")) "drizzle_union" order by 1 limit $1',
			);
			expect(query.toSQL().sql).not.toContain('order by 1  ');
		});

		it(`$with field is cast by field's alias`, ({ expect }) => {
			const w = castDb.$with('w').as(castDb.select({ castValue: casts.castValue }).from(casts));

			expect(castDb.with(w).select({ x: w }).from(w).toSQL().sql).toEqual(
				'with "w" as (select "cast_value" from "casts") select "w"::text from "w"',
			);
		});
	});

	describe('param casts', () => {
		const paramCodecs = {
			...nodeCockroachCodecs,
			int4: {
				...nodeCockroachCodecs.int4,
				castParam: (name: string) => `${name}::int4`,
				normalizeParam: (value: number) => value * 10,
			},
		};
		const paramDb = drizzle.mock({ codecs: paramCodecs });
		const paramValues = snakeCase.table('params', { paramValue: int4() });

		it('Param codecs are applied to bound params', ({ expect }) => {
			expect(paramDb.select().from(paramValues).where(eq(paramValues.paramValue, 1)).toSQL()).toEqual({
				sql: 'select "param_value" from "params" where "params"."param_value" = $1::int4',
				params: [10],
			});
		});

		it(`castParam isn't applied to inlined params`, ({ expect }) => {
			const query = paramDb.select().from(paramValues).where(eq(paramValues.paramValue, 1).inlineParams()).toSQL();

			expect(query).toEqual({
				sql: 'select "param_value" from "params" where "params"."param_value" = 1',
				params: [],
			});
			expect(query.sql).not.toContain('::int4');
		});

		it(`normalizeParam isn't applied to inlined params`, ({ expect }) => {
			const query = paramDb.select().from(paramValues).where(eq(paramValues.paramValue, 7).inlineParams()).toSQL();

			expect(query).toEqual({
				sql: 'select "param_value" from "params" where "params"."param_value" = 7',
				params: [],
			});

			expect(query.sql).not.toContain('70');
		});

		it('Placeholder params are still cast when params are inlined', ({ expect }) => {
			const placeholder = new Param(sql.placeholder('value'), paramValues.paramValue);
			const query = paramDb
				.select()
				.from(paramValues)
				.where(sql`${paramValues.paramValue} = ${placeholder}`.inlineParams())
				.toSQL();

			expect(query.sql).toEqual('select "param_value" from "params" where "params"."param_value" = $1::int4');
		});
	});
});
