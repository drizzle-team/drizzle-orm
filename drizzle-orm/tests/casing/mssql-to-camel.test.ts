import mssql from 'mssql';
import { describe, it } from 'vitest';
import { alias, bit, camelCase, castToText, int, QueryBuilder, text, union } from '~/mssql-core';
import { drizzle, nodeMssqlCodecs } from '~/node-mssql';
import { defineRelations } from '~/relations';
import { asc, eq, sql } from '~/sql';

const testSchema = camelCase.schema('test');
const users = camelCase.table('users', {
	// TODO: Investigate reasons for existence of next commented line
	// id: int().primaryKey().identity(1, 1),
	id: int().primaryKey().identity({
		seed: 1,
		increment: 1,
	}),
	first_name: text().notNull(),
	last_name: text().notNull(),
	// Test that custom aliases remain
	age: int('AGE'),
});

const developers = testSchema.table('developers', {
	// TODO: Investigate reasons for existence of next commented line
	// user_id: int().primaryKey().primaryKey().references('name1', () => users.id),
	user_id: int().primaryKey().primaryKey().references(() => users.id),
	uses_drizzle_orm: bit().notNull(),
});

const devs = alias(developers, 'devs');
const db = drizzle({ client: new mssql.ConnectionPool({ server: '' }) });

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
const rqbDb = drizzle({ client: new mssql.ConnectionPool({ server: '' }), relations: rqbRelations });

const fullName = sql`${users.first_name} || ' ' || ${users.last_name}`.as('name');

describe('mssql to camel case', () => {
	it('unicode column names', ({ expect }) => {
		const unicode = camelCase.table('unicode', {
			칼럼명: text(),
		});

		expect(db.select().from(unicode).toSQL().sql).toEqual(
			'select [칼럼명] from [unicode]',
		);
	});

	it('qualifier preservation for sql fields', ({ expect }) => {
		const a = camelCase.table('a', { id: int('id').primaryKey(), cId: int().notNull() });
		const b = camelCase.table('b', { id: int('id').primaryKey(), cId: int().notNull(), label: text() });
		const corr = sql`(select ${b.label} from ${b} where ${b.cId} = ${a.cId})`;

		expect(db.select({ id: a.id, bRaw: corr }).from(a).toSQL().sql).toEqual(
			'select [id], (select [b].[label] from [b] where [b].[cId] = [a].[cId]) from [a]',
		);
		expect(db.select({ id: a.id, bRaw: corr.as('b_raw') }).from(a).toSQL().sql).toEqual(
			'select [id], (select [b].[label] from [b] where [b].[cId] = [a].[cId]) as [b_raw] from [a]',
		);
		expect(db.select({ id: a.id }).from(a).where(corr).toSQL().sql).toEqual(
			'select [id] from [a] where (select [b].[label] from [b] where [b].[cId] = [a].[cId])',
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
				"select [sq].[id], [sq].[name] from [users] left join (select [id], [firstName] || ' ' || [lastName] as [name] from [users]) [sq] on [users].[id] = [sq].[id]",
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
				"with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select [d0].[id] as [id], [d0].[user_role] as [role], coalesce([r0_0].[j], '[]') as [developers] from [staff_members] as [d0] outer apply (select [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm] from [test].[developers] as [d1] where [d0].[id] = [d1].[userId] for json path, include_null_values) [r0_0]([j]) where [d0].[user_role] like @par0 order by [d0].[firstName] asc",
			params: ['A%'],
		});
	});

	it("relational query joining on a subquery's aliased sql field", ({ expect }) => {
		const query = rqbDb.query.developers.findMany({ with: { member: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select [d0].[userId] as [user_id], [d0].[usesDrizzleOrm] as [uses_drizzle_orm], [r0_0].[j] as [member] from [test].[developers] as [d0] outer apply (select top(@par0) [d1].[id] as [id], [d1].[firstName] as [first_name], [d1].[user_role] as [role] from [staff_members] as [d1] where [d0].[userId] = [d1].[user_role] for json path, include_null_values, without_array_wrapper) [r0_0]([j])',
			params: [1],
		});
	});

	it('relational query - table, single level (find many)', ({ expect }) => {
		const query = rqbDb.query.users.findMany({});

		expect(query.toSQL()).toEqual({
			sql:
				'select [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name], [d0].[AGE] as [age] from [users] as [d0]',
			params: [],
		});
	});

	it('relational query - table, single level (find first)', ({ expect }) => {
		const query = rqbDb.query.users.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name], [d0].[AGE] as [age] from [users] as [d0]',
			params: [1],
		});
	});

	it('relational query - table, nested (find many)', ({ expect }) => {
		const query = rqbDb.query.users.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name], [d0].[AGE] as [age], [r0_0].[j] as [developers] from [users] as [d0] outer apply (select top(@par0) [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm] from [test].[developers] as [d1] where [d0].[id] = [d1].[userId] for json path, include_null_values, without_array_wrapper) [r0_0]([j])',
			params: [1],
		});
	});

	it('relational query - table, nested (find first)', ({ expect }) => {
		const query = rqbDb.query.users.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				'select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name], [d0].[AGE] as [age], [r0_0].[j] as [developers] from [users] as [d0] outer apply (select top(@par1) [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm] from [test].[developers] as [d1] where [d0].[id] = [d1].[userId] for json path, include_null_values, without_array_wrapper) [r0_0]([j])',
			params: [1, 1],
		});
	});

	it('relational query - table, deeply nested (find many)', ({ expect }) => {
		const query = rqbDb.query.users.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"select [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name], [d0].[AGE] as [age], [r0_0].[j] as [developers] from [users] as [d0] outer apply (select top(@par0) [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm], json_query(coalesce([r1_0].[j], '[]')) as [projects] from [test].[developers] as [d1] outer apply (select [d2].[id] as [id], [d2].[developerId] as [developer_id], [d2].[projectName] as [project_name] from [projects] as [d2] where [d1].[userId] = [d2].[developerId] for json path, include_null_values) [r1_0]([j]) where [d0].[id] = [d1].[userId] for json path, include_null_values, without_array_wrapper) [r0_0]([j])",
			params: [1],
		});
	});

	it('relational query - table, deeply nested (find first)', ({ expect }) => {
		const query = rqbDb.query.users.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name], [d0].[AGE] as [age], [r0_0].[j] as [developers] from [users] as [d0] outer apply (select top(@par1) [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm], json_query(coalesce([r1_0].[j], '[]')) as [projects] from [test].[developers] as [d1] outer apply (select [d2].[id] as [id], [d2].[developerId] as [developer_id], [d2].[projectName] as [project_name] from [projects] as [d2] where [d1].[userId] = [d2].[developerId] for json path, include_null_values) [r1_0]([j]) where [d0].[id] = [d1].[userId] for json path, include_null_values, without_array_wrapper) [r0_0]([j])",
			params: [1, 1],
		});
	});

	it('relational query - view, single level (find first)', ({ expect }) => {
		const query = rqbDb.query.usersView.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name] from [users_view] as [d0]',
			params: [1],
		});
	});

	it('relational query - view, nested (find many)', ({ expect }) => {
		const query = rqbDb.query.usersView.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"select [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name], coalesce([r0_0].[j], '[]') as [developers] from [users_view] as [d0] outer apply (select [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm] from [test].[developers] as [d1] where [d0].[id] = [d1].[userId] for json path, include_null_values) [r0_0]([j])",
			params: [],
		});
	});

	it('relational query - mixed table -> table -> view (find many)', ({ expect }) => {
		const query = rqbDb.query.projects.findMany({
			with: { developer: { with: { viewUser: true, member: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				'with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select [d0].[id] as [id], [d0].[developerId] as [developer_id], [d0].[projectName] as [project_name], [r0_0].[j] as [developer] from [projects] as [d0] outer apply (select top(@par0) [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm], json_query([r1_0].[j]) as [viewUser], json_query([r1_1].[j]) as [member] from [test].[developers] as [d1] outer apply (select top(@par1) [d2].[id] as [id], [d2].[firstName] as [first_name], [d2].[lastName] as [last_name] from [users_view] as [d2] where [d1].[userId] = [d2].[id] for json path, include_null_values, without_array_wrapper) [r1_0]([j]) outer apply (select top(@par2) [d2].[id] as [id], [d2].[firstName] as [first_name], [d2].[user_role] as [role] from [staff_members] as [d2] where [d1].[userId] = [d2].[user_role] for json path, include_null_values, without_array_wrapper) [r1_1]([j]) where [d0].[developerId] = [d1].[userId] for json path, include_null_values, without_array_wrapper) [r0_0]([j])',
			params: [1, 1, 1],
		});
	});

	it('relational query - mixed view -> table -> table (find first)', ({ expect }) => {
		const query = rqbDb.query.usersView.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[lastName] as [last_name], coalesce([r0_0].[j], '[]') as [developers] from [users_view] as [d0] outer apply (select [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm], json_query(coalesce([r1_0].[j], '[]')) as [projects] from [test].[developers] as [d1] outer apply (select [d2].[id] as [id], [d2].[developerId] as [developer_id], [d2].[projectName] as [project_name] from [projects] as [d2] where [d1].[userId] = [d2].[developerId] for json path, include_null_values) [r1_0]([j]) where [d0].[id] = [d1].[userId] for json path, include_null_values) [r0_0]([j])",
			params: [1],
		});
	});

	it('relational query - subquery, single level (find many)', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({});

		expect(query.toSQL()).toEqual({
			sql:
				'with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[user_role] as [role] from [staff_members] as [d0]',
			params: [],
		});
	});

	it('relational query - subquery, single level (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({});

		expect(query.toSQL()).toEqual({
			sql:
				'with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[user_role] as [role] from [staff_members] as [d0]',
			params: [1],
		});
	});

	it('relational query - subquery, nested (find many)', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[user_role] as [role], coalesce([r0_0].[j], '[]') as [developers] from [staff_members] as [d0] outer apply (select [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm] from [test].[developers] as [d1] where [d0].[id] = [d1].[userId] for json path, include_null_values) [r0_0]([j])",
			params: [],
		});
	});

	it('relational query - subquery, nested (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({ with: { developers: true } });

		expect(query.toSQL()).toEqual({
			sql:
				"with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[user_role] as [role], coalesce([r0_0].[j], '[]') as [developers] from [staff_members] as [d0] outer apply (select [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm] from [test].[developers] as [d1] where [d0].[id] = [d1].[userId] for json path, include_null_values) [r0_0]([j])",
			params: [1],
		});
	});

	it('relational query - subquery, deeply nested (find many)', ({ expect }) => {
		const query = rqbDb.query.staff.findMany({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[user_role] as [role], coalesce([r0_0].[j], '[]') as [developers] from [staff_members] as [d0] outer apply (select [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm], json_query(coalesce([r1_0].[j], '[]')) as [projects] from [test].[developers] as [d1] outer apply (select [d2].[id] as [id], [d2].[developerId] as [developer_id], [d2].[projectName] as [project_name] from [projects] as [d2] where [d1].[userId] = [d2].[developerId] for json path, include_null_values) [r1_0]([j]) where [d0].[id] = [d1].[userId] for json path, include_null_values) [r0_0]([j])",
			params: [],
		});
	});

	it('relational query - subquery, deeply nested (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({ with: { developers: { with: { projects: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[user_role] as [role], coalesce([r0_0].[j], '[]') as [developers] from [staff_members] as [d0] outer apply (select [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm], json_query(coalesce([r1_0].[j], '[]')) as [projects] from [test].[developers] as [d1] outer apply (select [d2].[id] as [id], [d2].[developerId] as [developer_id], [d2].[projectName] as [project_name] from [projects] as [d2] where [d1].[userId] = [d2].[developerId] for json path, include_null_values) [r1_0]([j]) where [d0].[id] = [d1].[userId] for json path, include_null_values) [r0_0]([j])",
			params: [1],
		});
	});

	it('relational query - mixed table -> subquery -> table (find many)', ({ expect }) => {
		const query = rqbDb.query.developers.findMany({ with: { member: { with: { developers: true } } } });

		expect(query.toSQL()).toEqual({
			sql:
				"with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select [d0].[userId] as [user_id], [d0].[usesDrizzleOrm] as [uses_drizzle_orm], [r0_0].[j] as [member] from [test].[developers] as [d0] outer apply (select top(@par0) [d1].[id] as [id], [d1].[firstName] as [first_name], [d1].[user_role] as [role], json_query(coalesce([r1_0].[j], '[]')) as [developers] from [staff_members] as [d1] outer apply (select [d2].[userId] as [user_id], [d2].[usesDrizzleOrm] as [uses_drizzle_orm] from [test].[developers] as [d2] where [d1].[id] = [d2].[userId] for json path, include_null_values) [r1_0]([j]) where [d0].[userId] = [d1].[user_role] for json path, include_null_values, without_array_wrapper) [r0_0]([j])",
			params: [1],
		});
	});

	it('relational query - mixed subquery -> table -> view (find first)', ({ expect }) => {
		const query = rqbDb.query.staff.findFirst({
			with: { developers: { with: { viewUser: true } } },
		});

		expect(query.toSQL()).toEqual({
			sql:
				"with [staff_members] as (select [id], [firstName], upper([lastName]) as [user_role] from [users]) select top(@par0) [d0].[id] as [id], [d0].[firstName] as [first_name], [d0].[user_role] as [role], coalesce([r0_0].[j], '[]') as [developers] from [staff_members] as [d0] outer apply (select [d1].[userId] as [user_id], [d1].[usesDrizzleOrm] as [uses_drizzle_orm], json_query([r1_0].[j]) as [viewUser] from [test].[developers] as [d1] outer apply (select top(@par1) [d2].[id] as [id], [d2].[firstName] as [first_name], [d2].[lastName] as [last_name] from [users_view] as [d2] where [d1].[userId] = [d2].[id] for json path, include_null_values, without_array_wrapper) [r1_0]([j]) where [d0].[id] = [d1].[userId] for json path, include_null_values) [r0_0]([j])",
			params: [1, 1],
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
				"select [users].[firstName] || ' ' || [users].[lastName] as [name], [users].[AGE] from [users] left join [test].[developers] on [users].[id] = [test].[developers].[userId] order by [users].[firstName] asc",
			params: [],
		});
	});

	it('select #2', ({ expect }) => {
		const query = db
			.select({ name: fullName, age: users.age })
			.from(users)
			.leftJoin(developers, eq(users.id, developers.user_id))
			.where(eq(users.id, 15))
			.orderBy(asc(users.first_name));

		expect(query.toSQL()).toEqual({
			sql:
				"select [users].[firstName] || ' ' || [users].[lastName] as [name], [users].[AGE] from [users] left join [test].[developers] on [users].[id] = [test].[developers].[userId] where [users].[id] = @par0 order by [users].[firstName] asc",
			params: [15],
		});
	});

	it('select (with alias)', ({ expect }) => {
		const query = db
			.select({ firstName: users.first_name })
			.from(users)
			.leftJoin(devs, eq(users.id, devs.user_id));

		expect(query.toSQL()).toEqual({
			sql:
				'select [users].[firstName] from [users] left join [test].[developers] [devs] on [users].[id] = [devs].[userId]',
			params: [],
		});
	});

	it('with CTE', ({ expect }) => {
		const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with [cte] as (select [firstName] || ' ' || [lastName] as [name] from [users]) select [name] from [cte]",
			params: [],
		});
	});

	it('with CTE (with query builder)', ({ expect }) => {
		const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with [cte] as (select [firstName] || ' ' || [lastName] as [name] from [users]) select [name] from [cte]",
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
				'select [firstName] from ((select [firstName] from [users]) union (select [firstName] from [users])) [drizzle_union]',
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
				'select [firstName] from ((select [firstName] from [users]) union (select [firstName] from [users])) [drizzle_union]',
			params: [],
		});
	});

	it('insert', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into [users] ([firstName], [lastName], [AGE]) values (@par0, @par1, @par2)',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (column selection)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into [users] ([firstName], [lastName], [AGE]) values (@par0, @par1, @par2)',
			params: ['John', 'Doe', 30],
		});
	});

	it('insert (column selection, multiple rows)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name')
			.values([{ first_name: 'John', last_name: 'Doe' }, { first_name: 'Jane', last_name: 'Roe' }]);

		expect(query.toSQL()).toEqual({
			sql: 'insert into [users] ([firstName], [lastName]) values (@par0, @par1), (@par2, @par3)',
			params: ['John', 'Doe', 'Jane', 'Roe'],
		});
	});

	it('insert (column selection, omitted optional column)', ({ expect }) => {
		const query = db
			.insert(users, 'first_name', 'last_name', 'age')
			.values({ first_name: 'John', last_name: 'Doe' });

		expect(query.toSQL()).toEqual({
			sql: 'insert into [users] ([firstName], [lastName], [AGE]) values (@par0, @par1, default)',
			params: ['John', 'Doe'],
		});
	});

	it('insert (column selection) emits columns in list order', ({ expect }) => {
		const query = db
			.insert(users, 'age', 'last_name', 'first_name')
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into [users] ([AGE], [lastName], [firstName]) values (@par0, @par1, @par2)',
			params: [30, 'Doe', 'John'],
		});
	});

	it('update', ({ expect }) => {
		const query = db
			.update(users)
			.set({ first_name: 'John', last_name: 'Doe', age: 30 })
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'update [users] set [firstName] = @par0, [lastName] = @par1, [AGE] = @par2 where [users].[id] = @par3',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'delete from [users] where [users].[id] = @par0',
			params: [1],
		});
	});

	it('select columns as', ({ expect }) => {
		const query = db
			.select({ age: users.age.as('ageOfUser'), id: users.id.as('userId') })
			.from(users)
			.orderBy(asc(users.id.as('userId')));

		expect(query.toSQL()).toEqual({
			sql: 'select [AGE] as [ageOfUser], [id] as [userId] from [users] order by [userId] asc',
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
				"select [users].[firstName] || ' ' || [users].[lastName] as [name], [users].[AGE] as [ageOfUser], [users].[id] as [userId] from [users] left join [test].[developers] on [userId] = [test].[developers].[userId] order by [users].[firstName] asc",
			params: [],
		});
	});

	it('insert output as', ({ expect }) => {
		const query = db
			.insert(users)
			.output({ firstName: users.first_name, age: users.age.as('userAge') })
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into [users] ([firstName], [lastName], [AGE]) output INSERTED.[firstName], INSERTED.[AGE] as [userAge] values (@par0, @par1, @par2)',
			params: ['John', 'Doe', 30],
		});
	});

	it('update output as', ({ expect }) => {
		const query = db
			.update(users)
			.set({ first_name: 'John', last_name: 'Doe', age: 30 })
			.output({
				inserted: { firstName: users.first_name.as('usersNameIn'), age: users.age.as('ageIn') },
				deleted: { firstName: users.first_name.as('usersNameOut'), age: users.age.as('ageOut') },
			})
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql:
				'update [users] set [firstName] = @par0, [lastName] = @par1, [AGE] = @par2 output INSERTED.[firstName] as [usersNameIn], INSERTED.[AGE] as [ageIn], DELETED.[firstName] as [usersNameOut], DELETED.[AGE] as [ageOut] where [users].[id] = @par3',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete output as', ({ expect }) => {
		const query = db
			.delete(users)
			.output({ firstName: users.first_name, age: users.age.as('usersAge') })
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'delete from [users] output DELETED.[firstName], DELETED.[AGE] as [usersAge] where [users].[id] = @par0',
			params: [1],
		});
	});

	describe('selection casts', () => {
		const castCodecs = { ...nodeMssqlCodecs, int: { ...nodeMssqlCodecs.int, cast: castToText } };
		const castDb = drizzle({ client: new mssql.ConnectionPool({ server: '' }), codecs: castCodecs });
		const casts = camelCase.table('casts', { cast_value: int() });
		const castTargets = camelCase.table('cast_targets', { target_id: text() });
		const castSubquery = () => castDb.select({ cast_value: casts.cast_value }).from(casts).as('sq');

		it(`Cast respects alias config`, ({ expect }) => {
			expect(castDb.select({ c: casts.cast_value }).from(casts).toSQL().sql).toEqual(
				'select cast([castValue] as varchar(max)) from [casts]',
			);
			expect(castDb.select({ c: casts.cast_value.as('alias') }).from(casts).toSQL().sql).toEqual(
				'select cast([castValue] as varchar(max)) as [alias] from [casts]',
			);
		});

		it(`Cast applied to selected subquery depending on it's selection`, ({ expect }) => {
			expect(castDb.select({ x: castSubquery() }).from(castTargets).toSQL().sql).toEqual(
				'select cast((select [castValue] from [casts]) as varchar(max)) [sq] from [cast_targets]',
			);
		});

		it('Nested queries ignore casts', ({ expect }) => {
			const outer = castDb.select({ x: castSubquery() }).from(castTargets).as('outer');

			expect(castDb.select().from(outer).toSQL().sql).toEqual(
				'select cast((select [castValue] from [casts]) as varchar(max)) [sq] from (select (select [castValue] from [casts]) [sq] from [cast_targets]) [outer]',
			);
		});

		it(`Column as decoder applies cast`, ({ expect }) => {
			expect(
				castDb.select({
					x: sql`${casts.cast_value}`.mapWith(casts.cast_value),
					y: sql`${casts.cast_value}`.mapWith(casts.cast_value).as('y'),
				}).from(casts).toSQL().sql,
			)
				.toEqual('select cast([castValue] as varchar(max)), cast([castValue] as varchar(max)) as [y] from [casts]');
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
				.orderBy(sql`1`);

			expect(query.toSQL().sql).toEqual(
				'select cast([castValue] as varchar(max)) from ((select [castValue] from [casts]) union all (select [castValue] from [casts])) [drizzle_union] order by 1',
			);
			expect(query.toSQL().sql).not.toContain('order by 1  ');
		});
	});
});
