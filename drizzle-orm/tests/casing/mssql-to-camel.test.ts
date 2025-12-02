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
	first_name: text().notNull(),
	last_name: text().notNull(),
	// Test that custom aliases remain
	age: int('AGE'),
});
const usersRelations = relations(users, ({ one }) => ({
	developers: one(developers),
}));
const developers = testSchema.table('developers', {
	// TODO: Investigate reasons for existence of next commented line
	// user_id: int().primaryKey().primaryKey().references('name1', () => users.id),
	user_id: int().primaryKey().primaryKey().references(() => users.id),
	uses_drizzle_orm: bit().notNull(),
});
const developersRelations = relations(developers, ({ one }) => ({
	user: one(users, {
		fields: [developers.user_id],
		references: [users.id],
	}),
}));
const devs = alias(developers, 'devs');
const schema = { users, usersRelations, developers, developersRelations };

const db = drizzle({ client: new mssql.ConnectionPool({ server: '' }), schema, casing: 'camelCase' });

const usersCache = {
	'public.users.id': 'id',
	'public.users.first_name': 'firstName',
	'public.users.last_name': 'lastName',
	'public.users.AGE': 'age',
};
const developersCache = {
	'test.developers.user_id': 'userId',
	'test.developers.uses_drizzle_orm': 'usesDrizzleOrm',
};
const cache = {
	...usersCache,
	...developersCache,
};

const fullName = sql`${users.first_name} || ' ' || ${users.last_name}`.as('name');

describe('mssql to camel case', () => {
	beforeEach(() => {
		db.dialect.casing.clearCache();
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
		expect(db.dialect.casing.cache).toEqual(cache);
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
		expect(db.dialect.casing.cache).toEqual(cache);
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
		expect(db.dialect.casing.cache).toEqual(cache);
	});

	it('with CTE', ({ expect }) => {
		const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with [cte] as (select [firstName] || ' ' || [lastName] as [name] from [users]) select [name] from [cte]",
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('with CTE (with query builder)', ({ expect }) => {
		const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
		const query = db.with(cte).select().from(cte);

		expect(query.toSQL()).toEqual({
			sql: "with [cte] as (select [firstName] || ' ' || [lastName] as [name] from [users]) select [name] from [cte]",
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('set operator', ({ expect }) => {
		const query = db
			.select({ firstName: users.first_name })
			.from(users)
			.union(db.select({ firstName: users.first_name }).from(users));

		expect(query.toSQL()).toEqual({
			sql: '(select [firstName] from [users]) union (select [firstName] from [users])',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('set operator (function)', ({ expect }) => {
		const query = union(
			db.select({ firstName: users.first_name }).from(users),
			db.select({ firstName: users.first_name }).from(users),
		);

		expect(query.toSQL()).toEqual({
			sql: '(select [firstName] from [users]) union (select [firstName] from [users])',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('insert', ({ expect }) => {
		const query = db
			.insert(users)
			.values({ first_name: 'John', last_name: 'Doe', age: 30 });

		expect(query.toSQL()).toEqual({
			sql: 'insert into [users] ([firstName], [lastName], [AGE]) values (@par0, @par1, @par2)',
			params: ['John', 'Doe', 30],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
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
});
