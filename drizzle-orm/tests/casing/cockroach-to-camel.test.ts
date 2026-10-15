import { describe, it } from 'vitest';
import { drizzle, nodeCockroachCodecs } from '~/cockroach';
import { alias, boolean, camelCase, castToText, int4, QueryBuilder, text, union } from '~/cockroach-core';
import { defineRelations } from '~/relations';
import { asc, eq, exists, inArray, Param, sql } from '~/sql';

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

const projects = camelCase.table('projects', {
	id: int4().primaryKey(),
	developer_id: int4(),
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

const relations = defineRelations({ users, developers, projects, staff, usersView }, (r) => ({
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

	it('relational query over a subquery source', ({ expect }) => {
		const query = db.query.staff.findMany({
			columns: { id: true, role: true },
			where: { role: { like: 'A%' } },
			orderBy: { first_name: 'asc' },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."user_role" as "role", "developers"."r" as "developers" from "staff_members" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId") as "t") as "developers" on true where "d0"."user_role" like $1 order by "d0"."firstName" asc',
			params: ['A%'],
		});
	});

	it("relational query joining on a subquery's aliased sql field", ({ expect }) => {
		const query = db.query.developers.findMany({ with: { member: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm", "member"."r" as "member" from "test"."developers" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."id" as "id", "d1"."firstName" as "first_name", "d1"."user_role" as "role" from "staff_members" as "d1" where "d0"."userId" = "d1"."user_role" limit $1) as "t") as "member" on true',
			params: [1],
		});
	});

	it('relational query - table, single level (find many)', ({ expect }) => {
		const query = db.query.users.findMany({});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age" from "users" as "d0"',
			params: [],
		});
	});

	it('relational query - table, single level (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age" from "users" as "d0" limit $1',
			params: [1],
		});
	});

	it('relational query - table, nested (find many)', ({ expect }) => {
		const query = db.query.users.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $1) as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - table, nested (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" limit $1) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $2) as "t") as "developers" on true',
			params: [1, 1],
		});
	});

	it('relational query - table, deeply nested (find many)', ({ expect }) => {
		const query = db.query.users.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developerId" as "developer_id", "d2"."projectName" as "project_name" from "projects" as "d2" where "d1"."userId" = "d2"."developerId") as "t") as "projects" on true where "d0"."id" = "d1"."userId" limit $1) as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - table, deeply nested (find first)', ({ expect }) => {
		const query = db.query.users.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" limit $1) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developerId" as "developer_id", "d2"."projectName" as "project_name" from "projects" as "d2" where "d1"."userId" = "d2"."developerId") as "t") as "projects" on true where "d0"."id" = "d1"."userId" limit $2) as "t") as "developers" on true',
			params: [1, 1],
		});
	});

	it('relational query - view, single level (find first)', ({ expect }) => {
		const query = db.query.usersView.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name" from "users_view" as "d0" limit $1',
			params: [1],
		});
	});

	it('relational query - view, nested (find many)', ({ expect }) => {
		const query = db.query.usersView.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "developers"."r" as "developers" from "users_view" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId") as "t") as "developers" on true',
			params: [],
		});
	});

	it('relational query - mixed table -> table -> view (find many)', ({ expect }) => {
		const query = db.query.projects.findMany({
			with: { developer: { with: { viewUser: true, member: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."developerId" as "developer_id", "d0"."projectName" as "project_name", "developer"."r" as "developer" from "projects" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm", "viewUser"."r" as "viewUser", "member"."r" as "member" from "test"."developers" as "d1" left join lateral(select row_to_json("t".*) "r" from (select "d2"."id" as "id", "d2"."firstName" as "first_name", "d2"."lastName" as "last_name" from "users_view" as "d2" where "d1"."userId" = "d2"."id" limit $1) as "t") as "viewUser" on true left join lateral(select row_to_json("t".*) "r" from (select "d2"."id" as "id", "d2"."firstName" as "first_name", "d2"."user_role" as "role" from "staff_members" as "d2" where "d1"."userId" = "d2"."user_role" limit $2) as "t") as "member" on true where "d0"."developerId" = "d1"."userId" limit $3) as "t") as "developer" on true',
			params: [1, 1, 1],
		});
	});

	it('relational query - mixed view -> table -> table (find first)', ({ expect }) => {
		const query = db.query.usersView.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "developers"."r" as "developers" from (select "d0".* from "users_view" as "d0" limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developerId" as "developer_id", "d2"."projectName" as "project_name" from "projects" as "d2" where "d1"."userId" = "d2"."developerId") as "t") as "projects" on true where "d0"."id" = "d1"."userId") as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - subquery, single level (find many)', ({ expect }) => {
		const query = db.query.staff.findMany({});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role" from "staff_members" as "d0"',
			params: [],
		});
	});

	it('relational query - subquery, single level (find first)', ({ expect }) => {
		const query = db.query.staff.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role" from "staff_members" as "d0" limit $1',
			params: [1],
		});
	});

	it('relational query - subquery, nested (find many)', ({ expect }) => {
		const query = db.query.staff.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role", "developers"."r" as "developers" from "staff_members" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId") as "t") as "developers" on true',
			params: [],
		});
	});

	it('relational query - subquery, nested (find first)', ({ expect }) => {
		const query = db.query.staff.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role", "developers"."r" as "developers" from (select "d0".* from "staff_members" as "d0" limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId") as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - subquery, deeply nested (find many)', ({ expect }) => {
		const query = db.query.staff.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role", "developers"."r" as "developers" from "staff_members" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developerId" as "developer_id", "d2"."projectName" as "project_name" from "projects" as "d2" where "d1"."userId" = "d2"."developerId") as "t") as "projects" on true where "d0"."id" = "d1"."userId") as "t") as "developers" on true',
			params: [],
		});
	});

	it('relational query - subquery, deeply nested (find first)', ({ expect }) => {
		const query = db.query.staff.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role", "developers"."r" as "developers" from (select "d0".* from "staff_members" as "d0" limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from "test"."developers" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."id" as "id", "d2"."developerId" as "developer_id", "d2"."projectName" as "project_name" from "projects" as "d2" where "d1"."userId" = "d2"."developerId") as "t") as "projects" on true where "d0"."id" = "d1"."userId") as "t") as "developers" on true',
			params: [1],
		});
	});

	it('relational query - mixed table -> subquery -> table (find many)', ({ expect }) => {
		const query = db.query.developers.findMany({ with: { member: { with: { developers: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm", "member"."r" as "member" from "test"."developers" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."id" as "id", "d1"."firstName" as "first_name", "d1"."user_role" as "role", "developers"."r" as "developers" from "staff_members" as "d1" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d2"."userId" as "user_id", "d2"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d2" where "d1"."id" = "d2"."userId") as "t") as "developers" on true where "d0"."userId" = "d1"."user_role" limit $1) as "t") as "member" on true',
			params: [1],
		});
	});

	it('relational query - mixed subquery -> table -> view (find first)', ({ expect }) => {
		const query = db.query.staff.findFirst({
			with: { developers: { with: { viewUser: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role", "developers"."r" as "developers" from (select "d0".* from "staff_members" as "d0" limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm", "viewUser"."r" as "viewUser" from "test"."developers" as "d1" left join lateral(select row_to_json("t".*) "r" from (select "d2"."id" as "id", "d2"."firstName" as "first_name", "d2"."lastName" as "last_name" from "users_view" as "d2" where "d1"."userId" = "d2"."id" limit $2) as "t") as "viewUser" on true where "d0"."id" = "d1"."userId") as "t") as "developers" on true',
			params: [1, 1],
		});
	});

	it('relational query - table, nested + orderBy + limit', ({ expect }) => {
		const query = db.query.users.findMany({
			orderBy: { first_name: 'asc' },
			limit: 2,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" order by "d0"."firstName" asc limit $1) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $2) as "t") as "developers" on true order by "d0"."firstName" asc',
			params: [2, 1],
		});
	});

	it('relational query - table, nested + limit + offset', ({ expect }) => {
		const query = db.query.users.findMany({ limit: 2, offset: 4, with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" limit $1 offset $2) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $3) as "t") as "developers" on true',
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
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" limit $1) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $2) as "t") as "developers" on true',
			params: [2, 1],
		});
	});

	it('relational query - table, nested + where', ({ expect }) => {
		const query = db.query.users.findMany({
			where: { first_name: { like: 'A%' } },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $1) as "t") as "developers" on true where "d0"."firstName" like $2',
			params: [1, 'A%'],
		});
	});

	it('relational query - table, nested + relation where', ({ expect }) => {
		const query = db.query.users.findMany({
			where: { developers: { uses_drizzle_orm: true } },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $1) as "t") as "developers" on true where exists (select * from "test"."developers" as "f0" where (("d0"."id" = "f0"."userId") and ("f0"."usesDrizzleOrm" = $2)))',
			params: [1, true],
		});
	});

	it('relational query - table, nested + relation where + limit', ({ expect }) => {
		const query = db.query.users.findMany({
			where: { developers: { uses_drizzle_orm: true } },
			limit: 2,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" where exists (select * from "test"."developers" as "f0" where (("d0"."id" = "f0"."userId") and ("f0"."usesDrizzleOrm" = $1))) limit $2) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $3) as "t") as "developers" on true',
			params: [true, 2, 1],
		});
	});

	it('relational query - table, nested + where + orderBy', ({ expect }) => {
		const query = db.query.users.findMany({
			where: { first_name: { like: 'A%' } },
			orderBy: { first_name: 'asc' },
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $1) as "t") as "developers" on true where "d0"."firstName" like $2 order by "d0"."firstName" asc',
			params: [1, 'A%'],
		});
	});

	it('relational query - schema table, deeply nested + orderBy + limit on every level', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { user_id: 'desc' },
			limit: 3,
			with: {
				projects: { orderBy: { project_name: 'asc' }, limit: 2, with: { developer: true } },
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from (select "d0".* from "test"."developers" as "d0" order by "d0"."userId" desc limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developerId" as "developer_id", "d1"."projectName" as "project_name", "developer"."r" as "developer" from (select "d1".* from "projects" as "d1" where "d0"."userId" = "d1"."developerId" order by "d1"."projectName" asc limit $2) as "d1" left join lateral(select row_to_json("t".*) "r" from (select "d2"."userId" as "user_id", "d2"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d2" where "d1"."developerId" = "d2"."userId" limit $3) as "t") as "developer" on true order by "d1"."projectName" asc) as "t") as "projects" on true order by "d0"."userId" desc',
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
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role", "developers"."r" as "developers" from (select "d0".* from "staff_members" as "d0" order by "d0"."user_role" asc limit $1) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId") as "t") as "developers" on true order by "d0"."user_role" asc',
			params: [2],
		});
	});

	it('relational query - basic strategy, table, nested + where + orderBy + limit + offset', ({ expect }) => {
		const query = db.query.users.findMany({
			strategy: 'basic',
			where: { first_name: { like: 'A%' }, developers: { uses_drizzle_orm: true } },
			orderBy: { first_name: 'asc' },
			limit: 2,
			offset: 4,
			with: { developers: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age", "developers"."r" as "developers" from "users" as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."userId" as "user_id", "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $1) as "t") as "developers" on true where (("d0"."firstName" like $2) and (exists (select * from "test"."developers" as "f0" where (("d0"."id" = "f0"."userId") and ("f0"."usesDrizzleOrm" = $3))))) order by "d0"."firstName" asc limit $4 offset $5',
			params: [1, 'A%', true, 2, 4],
		});
	});

	it('relational query - basic strategy, schema table, deeply nested + orderBy + limit + offset on every level', ({ expect }) => {
		const query = db.query.developers.findMany({
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
				'select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from "test"."developers" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developerId" as "developer_id", "d1"."projectName" as "project_name", "developer"."r" as "developer" from "projects" as "d1" left join lateral(select row_to_json("t".*) "r" from (select "d2"."userId" as "user_id", "d2"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d2" where "d1"."developerId" = "d2"."userId" limit $1) as "t") as "developer" on true where "d0"."userId" = "d1"."developerId" order by "d1"."projectName" asc limit $2 offset $3) as "t") as "projects" on true order by "d0"."userId" desc limit $4 offset $5',
			params: [1, 2, 1, 3, 1],
		});
	});

	it('relational query - basic strategy, table, nested + orderBy relation + limit + offset (find first)', ({ expect }) => {
		const query = db.query.developers.findFirst({
			strategy: 'basic',
			orderBy: { projects: { id: 'desc(count)' }, user_id: 'asc' },
			offset: 1,
			with: { projects: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from "test"."developers" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developerId" as "developer_id", "d1"."projectName" as "project_name" from "projects" as "d1" where "d0"."userId" = "d1"."developerId") as "t") as "projects" on true order by (select count("o0"."id") from "projects" as "o0" where "d0"."userId" = "o0"."developerId") desc, "d0"."userId" asc limit $1 offset $2',
			params: [1, 1],
		});
	});

	it('relational query - table, orderBy field of a single relation', ({ expect }) => {
		const query = db.query.users.findMany({
			orderBy: { developers: { uses_drizzle_orm: 'desc' }, first_name: 'asc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."lastName" as "last_name", "d0"."AGE" as "age" from "users" as "d0" order by (select "o0"."usesDrizzleOrm" from "test"."developers" as "o0" where "d0"."id" = "o0"."userId" limit 1) desc, "d0"."firstName" asc',
			params: [],
		});
	});

	it('relational query - table, orderBy aggregates of a many relation + limit + offset, nested', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { projects: { project_name: 'asc(min)', id: 'desc(count)' }, user_id: 'asc' },
			limit: 3,
			offset: 1,
			with: { projects: true },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from (select "d0".* from "test"."developers" as "d0" order by (select min("o0"."projectName") from "projects" as "o0" where "d0"."userId" = "o0"."developerId") asc, (select count("o0"."id") from "projects" as "o0" where "d0"."userId" = "o0"."developerId") desc, "d0"."userId" asc limit $1 offset $2) as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developerId" as "developer_id", "d1"."projectName" as "project_name" from "projects" as "d1" where "d0"."userId" = "d1"."developerId") as "t") as "projects" on true order by (select min("o0"."projectName") from "projects" as "o0" where "d0"."userId" = "o0"."developerId") asc, (select count("o0"."id") from "projects" as "o0" where "d0"."userId" = "o0"."developerId") desc, "d0"."userId" asc',
			params: [3, 1],
		});
	});

	it('relational query - table, orderBy first row of a many relation', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { projects: { project_name: 'desc(first)', developer: { user: { first_name: 'asc(first)' } } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d0" order by (select "o0"."projectName" from "projects" as "o0" where "d0"."userId" = "o0"."developerId" limit 1) desc, (select "o2"."firstName" from "projects" as "o0" cross join "test"."developers" as "o1" cross join "users" as "o2" where (("d0"."userId" = "o0"."developerId") and ("o0"."developerId" = "o1"."userId") and ("o1"."userId" = "o2"."id")) limit 1) asc',
			params: [],
		});
	});

	it('relational query - table, orderBy number of rows of a many relation', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { projects: 'desc(count)', member: { developers: 'asc(count)' }, user_id: 'asc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d0" order by (select count(*) from "projects" as "o0" where "d0"."userId" = "o0"."developerId") desc, (select count(*) from "staff_members" as "o0" cross join "test"."developers" as "o1" where (("d0"."userId" = "o0"."user_role") and ("o0"."id" = "o1"."userId"))) asc, "d0"."userId" asc',
			params: [],
		});
	});

	it('relational query - table, orderBy fields of nested relations', ({ expect }) => {
		const query = db.query.projects.findMany({
			orderBy: { developer: { user: { last_name: 'asc' }, projects: { project_name: 'desc(max)', id: 'asc(avg)' } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."id" as "id", "d0"."developerId" as "developer_id", "d0"."projectName" as "project_name" from "projects" as "d0" order by (select "o1"."lastName" from "test"."developers" as "o0" cross join "users" as "o1" where (("d0"."developerId" = "o0"."userId") and ("o0"."userId" = "o1"."id")) limit 1) asc, (select max("o1"."projectName") from "test"."developers" as "o0" cross join "projects" as "o1" where (("d0"."developerId" = "o0"."userId") and ("o0"."userId" = "o1"."developerId"))) desc, (select avg("o1"."id") from "test"."developers" as "o0" cross join "projects" as "o1" where (("d0"."developerId" = "o0"."userId") and ("o0"."userId" = "o1"."developerId"))) asc',
			params: [],
		});
	});

	it('relational query - table, orderBy field of a subquery relation', ({ expect }) => {
		const query = db.query.developers.findMany({
			orderBy: { member: { role: 'asc', first_name: 'desc' } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d0" order by (select "o0"."user_role" from "staff_members" as "o0" where "d0"."userId" = "o0"."user_role" limit 1) asc, (select "o0"."firstName" from "staff_members" as "o0" where "d0"."userId" = "o0"."user_role" limit 1) desc',
			params: [],
		});
	});

	it('relational query - subquery, orderBy aggregate of a many relation', ({ expect }) => {
		const query = db.query.staff.findMany({
			orderBy: { developers: { uses_drizzle_orm: 'desc(max)', user: { first_name: 'asc(min)' } }, role: 'desc' },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with "staff_members" as (select "id", "firstName", upper("lastName") as "user_role" from "users") select "d0"."id" as "id", "d0"."firstName" as "first_name", "d0"."user_role" as "role" from "staff_members" as "d0" order by (select max("o0"."usesDrizzleOrm") from "test"."developers" as "o0" where "d0"."id" = "o0"."userId") desc, (select min("o1"."firstName") from "test"."developers" as "o0" cross join "users" as "o1" where (("d0"."id" = "o0"."userId") and ("o0"."userId" = "o1"."id"))) asc, "d0"."user_role" desc',
			params: [],
		});
	});

	it('relational query - table, nested relation ordered by fields of its relations', ({ expect }) => {
		const query = db.query.developers.findMany({
			with: {
				projects: {
					orderBy: { developer: { user: { first_name: 'desc' }, projects: { id: 'asc(count)' } }, id: 'asc' },
				},
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "d0"."userId" as "user_id", "d0"."usesDrizzleOrm" as "uses_drizzle_orm", "projects"."r" as "projects" from "test"."developers" as "d0" left join lateral(select coalesce(json_agg(row_to_json("t".*)), \'[]\') as "r" from (select "d1"."id" as "id", "d1"."developerId" as "developer_id", "d1"."projectName" as "project_name" from "projects" as "d1" where "d0"."userId" = "d1"."developerId" order by (select "o1"."firstName" from "test"."developers" as "o0" cross join "users" as "o1" where (("d1"."developerId" = "o0"."userId") and ("o0"."userId" = "o1"."id")) limit 1) desc, (select count("o1"."id") from "test"."developers" as "o0" cross join "projects" as "o1" where (("d1"."developerId" = "o0"."userId") and ("o0"."userId" = "o1"."developerId"))) asc, "d1"."id" asc) as "t") as "projects" on true',
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
				'select "d0"."id" as "id", "d0"."AGE" as "age", ("d0"."firstName" || \' \' || "d0"."lastName") as "fullName", "developers"."r" as "developers" from (select "d0".* from "users" as "d0" where "d0"."id" = $1 limit $2) as "d0" left join lateral(select row_to_json("t".*) "r" from (select "d1"."usesDrizzleOrm" as "uses_drizzle_orm" from "test"."developers" as "d1" where "d0"."id" = "d1"."userId" limit $3) as "t") as "developers" on true',
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

		it('Queries in operators ignore casts', ({ expect }) => {
			const inner = () => castDb.select({ cast_value: casts.cast_value }).from(casts);

			expect(castDb.select({ x: casts.cast_value }).from(casts).where(eq(casts.cast_value, inner())).toSQL().sql)
				.toEqual('select "castValue"::text from "casts" where "casts"."castValue" = (select "castValue" from "casts")');
			expect(castDb.select({ x: casts.cast_value }).from(casts).where(inArray(casts.cast_value, inner())).toSQL().sql)
				.toEqual(
					'select "castValue"::text from "casts" where "casts"."castValue" in (select "castValue" from "casts")',
				);
			expect(castDb.select({ x: casts.cast_value }).from(casts).where(exists(inner())).toSQL().sql)
				.toEqual('select "castValue"::text from "casts" where exists (select "castValue" from "casts")');
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
		const paramValues = camelCase.table('params', { param_value: int4() });

		it('Param codecs are applied to bound params', ({ expect }) => {
			expect(paramDb.select().from(paramValues).where(eq(paramValues.param_value, 1)).toSQL()).toEqual({
				sql: 'select "paramValue" from "params" where "params"."paramValue" = $1::int4',
				params: [10],
			});
		});

		it(`castParam isn't applied to inlined params`, ({ expect }) => {
			const query = paramDb.select().from(paramValues).where(eq(paramValues.param_value, 1).inlineParams()).toSQL();

			expect(query).toEqual({
				sql: 'select "paramValue" from "params" where "params"."paramValue" = 1',
				params: [],
			});
			expect(query.sql).not.toContain('::int4');
		});

		it(`normalizeParam isn't applied to inlined params`, ({ expect }) => {
			const query = paramDb.select().from(paramValues).where(eq(paramValues.param_value, 7).inlineParams()).toSQL();

			expect(query).toEqual({
				sql: 'select "paramValue" from "params" where "params"."paramValue" = 7',
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

			expect(query.sql).toEqual('select "paramValue" from "params" where "params"."paramValue" = $1::int4');
		});
	});
});
