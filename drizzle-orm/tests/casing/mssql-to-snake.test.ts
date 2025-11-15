import mssql from 'mssql';
import { beforeEach, describe, it } from 'vitest';
import { relations } from '~/_relations';
import { alias, bit, int, mssqlSchema, mssqlTable, text, union } from '~/mssql-core';
import { drizzle } from '~/node-mssql';
import { asc, eq, sql } from '~/sql';

const testSchema = mssqlSchema('test');
const users = mssqlTable('users', {
	// TODO: Investigate reasons for existence of next commented line
	// id: int().primaryKey().identity(1, 1),
	id: int().primaryKey().identity({
		seed: 1,
		increment: 1,
	}),
	firstName: text().notNull(),
	lastName: text().notNull(),
	// Test that custom aliases remain
	age: int('AGE'),
});
const usersRelations = relations(users, ({ one }) => ({
	developers: one(developers),
}));
const developers = testSchema.table('developers', {
	// TODO: Investigate reasons for existence of next commented line
	// userId: int().primaryKey().references('name1', () => users.id),
	userId: int().primaryKey().references(() => users.id),
	usesDrizzleORM: bit().notNull(),
});
const developersRelations = relations(developers, ({ one }) => ({
	user: one(users, {
		fields: [developers.userId],
		references: [users.id],
	}),
}));
const devs = alias(developers, 'devs');
const schema = { users, usersRelations, developers, developersRelations };

const db = drizzle({ client: new mssql.ConnectionPool({ server: '' }), schema, casing: 'snake_case' });

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

describe('mssql to snake case', () => {
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
				"select [users].[first_name] || ' ' || [users].[last_name] as [name], [users].[AGE] from [users] left join [test].[developers] on [users].[id] = [test].[developers].[user_id] order by [users].[first_name] asc",
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
				'select [users].[first_name] from [users] left join [test].[developers] [devs] on [users].[id] = [devs].[user_id]',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(cache);
	});

	it('with CTE', ({ expect }) => {
		const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with [cte] as (select [first_name] || ' ' || [last_name] as [name] from [users]) select [name] from [cte]",
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('with CTE (with query builder)', ({ expect }) => {
		const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with [cte] as (select [first_name] || ' ' || [last_name] as [name] from [users]) select [name] from [cte]",
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
			sql: '(select [first_name] from [users]) union (select [first_name] from [users])',
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
			sql: '(select [first_name] from [users]) union (select [first_name] from [users])',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('insert', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ firstName: 'John', lastName: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into [users] ([first_name], [last_name], [AGE]) values (@par0, @par1, @par2)',
			params: ['John', 'Doe', 30],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('update', ({ expect }) => {
		const query = db
			.update(users)
			.set({ firstName: 'John', lastName: 'Doe', age: 30 })
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'update [users] set [first_name] = @par0, [last_name] = @par1, [AGE] = @par2 where [users].[id] = @par3',
			params: ['John', 'Doe', 30, 1],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('delete', ({ expect }) => {
		const query = db
			.delete(users)
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'delete from [users] where [users].[id] = @par0',
			params: [1],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
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
			.leftJoin(developers, eq(users.id.as('userId'), developers.userId))
			.orderBy(asc(users.firstName));

		expect(query.toSQL()).toEqual({
			sql:
				"select [users].[first_name] || ' ' || [users].[last_name] as [name], [users].[AGE] as [ageOfUser], [users].[id] as [userId] from [users] left join [test].[developers] on [userId] = [test].[developers].[user_id] order by [users].[first_name] asc",
			params: [],
		});
	});

	it('insert output as', ({ expect }) => {
		const query = db
			.insert(users)
			.output({ firstName: users.firstName, age: users.age.as('userAge') })
			.values({ firstName: 'John', lastName: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into [users] ([first_name], [last_name], [AGE]) output INSERTED.[first_name], INSERTED.[AGE] as [userAge] values (@par0, @par1, @par2)',
			params: ['John', 'Doe', 30],
		});
	});

	it('update output as', ({ expect }) => {
		const query = db
			.update(users)
			.set({ firstName: 'John', lastName: 'Doe', age: 30 })
			.output({
				inserted: { firstName: users.firstName.as('usersNameIn'), age: users.age.as('ageIn') },
				deleted: { firstName: users.firstName.as('usersNameOut'), age: users.age.as('ageOut') },
			})
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql:
				'update [users] set [first_name] = @par0, [last_name] = @par1, [AGE] = @par2 output INSERTED.[first_name] as [usersNameIn], INSERTED.[AGE] as [ageIn], DELETED.[first_name] as [usersNameOut], DELETED.[AGE] as [ageOut] where [users].[id] = @par3',
			params: ['John', 'Doe', 30, 1],
		});
	});

	it('delete output as', ({ expect }) => {
		const query = db
			.delete(users)
			.output({ firstName: users.firstName, age: users.age.as('usersAge') })
			.where(eq(users.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'delete from [users] output DELETED.[first_name], DELETED.[AGE] as [usersAge] where [users].[id] = @par0',
			params: [1],
		});
	});
});
