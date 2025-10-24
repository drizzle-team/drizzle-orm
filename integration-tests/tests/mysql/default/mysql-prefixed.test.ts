import type { Equal } from 'drizzle-orm';
import { asc, eq, getTableName, gt, inArray, Name, sql, TransactionRollbackError } from 'drizzle-orm';
import {
	alias,
	bigint,
	boolean,
	date,
	datetime,
	getViewConfig,
	int,
	json,
	mysqlEnum,
	mysqlTable as mysqlTableRaw,
	mysqlTableCreator,
	mysqlView,
	serial,
	text,
	time,
	timestamp,
	uniqueIndex,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { expect } from 'vitest';
import { Expect, toLocalDate } from '~/utils';
import { mysqlTest as test } from '../instrumentation';

const tablePrefix = 'drizzle_tests_';

const mysqlTable = mysqlTableCreator((name) => `${tablePrefix}${name}`);

test.concurrent('select all fields', async ({ db, push }) => {
	const users = mysqlTable('users_1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const result = await db.select().from(users);

	expect(result[0]!.createdAt).toBeInstanceOf(Date);
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
	expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.concurrent('select sql', async ({ db, push }) => {
	const users = mysqlTable('users_sql', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const result = await db.select({
		name: sql`upper(${users.name})`,
	}).from(users);

	expect(result).toEqual([{ name: 'JOHN' }]);
});

test.concurrent('select typed sql', async ({ db, push }) => {
	const users = mysqlTable('users_typed_sql', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const result = await db.select({
		name: sql<string>`upper(${users.name})`,
	}).from(users);

	expect(result).toEqual([{ name: 'JOHN' }]);
});

test.concurrent('select distinct', async ({ db, push }) => {
	const usersDistinctTable = mysqlTable('users_distinct', {
		id: int('id').notNull(),
		name: text('name').notNull(),
	});

	await push({ usersDistinctTable });
	await db.insert(usersDistinctTable).values([
		{ id: 1, name: 'John' },
		{ id: 1, name: 'John' },
		{ id: 2, name: 'John' },
		{ id: 1, name: 'Jane' },
	]);
	const result = await db.selectDistinct().from(usersDistinctTable).orderBy(
		usersDistinctTable.id,
		usersDistinctTable.name,
	);

	expect(result).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
});

test.concurrent('insert returning sql', async ({ db, push }) => {
	const users = mysqlTable('users_insert_returning', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	const [result, _] = await db.insert(users).values({ name: 'John' });

	expect(result.insertId).toBe(1);
});

test.concurrent('delete returning sql', async ({ db, push }) => {
	const users = mysqlTable('users_delete_returning', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const result = await db.delete(users).where(eq(users.name, 'John'));

	expect(result[0].affectedRows).toBe(1);
});

test.concurrent('update returning sql', async ({ db, push }) => {
	const users = mysqlTable('users_update_returning', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const result = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'));

	expect(result[0].changedRows).toBe(1);
});

test.concurrent('update with returning all fields', async ({ db, push }) => {
	const users = mysqlTable('users_update_all_fields', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const updatedUsers = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'));

	const result = await db.select().from(users).where(eq(users.id, 1));

	expect(updatedUsers[0].changedRows).toBe(1);

	expect(result[0]!.createdAt).toBeInstanceOf(Date);
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
	expect(result).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.concurrent('update with returning partial', async ({ db, push }) => {
	const users = mysqlTable('users_update_partial', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const updatedUsers = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'));

	const result = await db.select({ id: users.id, name: users.name }).from(users).where(
		eq(users.id, 1),
	);

	expect(updatedUsers[0].changedRows).toBe(1);

	expect(result).toEqual([{ id: 1, name: 'Jane' }]);
});

test.concurrent('delete with returning all fields', async ({ db, push }) => {
	const users = mysqlTable('users_delete_all_fields', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const deletedUser = await db.delete(users).where(eq(users.name, 'John'));

	expect(deletedUser[0].affectedRows).toBe(1);
});

test.concurrent('delete with returning partial', async ({ db, push }) => {
	const users = mysqlTable('users_delete_partial', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const deletedUser = await db.delete(users).where(eq(users.name, 'John'));

	expect(deletedUser[0].affectedRows).toBe(1);
});

test.concurrent('insert + select', async ({ db, push }) => {
	const users = mysqlTable('users_insert_select_249', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const result = await db.select().from(users);
	expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

	await db.insert(users).values({ name: 'Jane' });
	const result2 = await db.select().from(users);
	expect(result2).toEqual([
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
		{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
	]);
});

test.concurrent('json insert', async ({ db, push }) => {
	const users = mysqlTable('users_json_insert_262', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db.select({
		id: users.id,
		name: users.name,
		jsonb: users.jsonb,
	}).from(users);

	expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test.concurrent('insert with overridden default values', async ({ db, push }) => {
	const users = mysqlTable('users_override_defaults_273', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John', verified: true });
	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.concurrent('insert many', async ({ db, push }) => {
	const users = mysqlTable('users_insert_many_307', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);
	const result = await db.select({
		id: users.id,
		name: users.name,
		jsonb: users.jsonb,
		verified: users.verified,
	}).from(users);

	expect(result).toEqual([
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test.concurrent('insert many with returning', async ({ db, push }) => {
	const users = mysqlTable('users_insert_many_returning_329', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	const result = await db.insert(users).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);

	expect(result[0].affectedRows).toBe(4);
});

test.concurrent('select with group by as field', async ({ db, push }) => {
	const users = mysqlTable('users_group_by_field_249', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: users.name }).from(users)
		.groupBy(users.name);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
});

test.concurrent('select with group by as sql', async ({ db, push }) => {
	const users = mysqlTable('users_group_by_sql_250', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: users.name }).from(users)
		.groupBy(sql`${users.name}`);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
});

test.concurrent('select with group by as sql + column', async ({ db, push }) => {
	const users = mysqlTable('users_group_by_sql_col_251', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: users.name }).from(users)
		.groupBy(sql`${users.name}`, users.id);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.concurrent('select with group by as column + sql', async ({ db, push }) => {
	const users = mysqlTable('users_group_by_col_sql_252', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: users.name }).from(users)
		.groupBy(users.id, sql`${users.name}`);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.concurrent('select with group by complex query', async ({ db, push }) => {
	const users = mysqlTable('users_group_by_complex_253', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: users.name }).from(users)
		.groupBy(users.id, sql`${users.name}`)
		.orderBy(asc(users.name))
		.limit(1);

	expect(result).toEqual([{ name: 'Jane' }]);
});

test.concurrent('build query', async ({ db, push }) => {
	const users = mysqlTable('users_build_query_254', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	const query = db.select({ id: users.id, name: users.name }).from(users)
		.groupBy(users.id, users.name)
		.toSQL();

	expect(query).toEqual({
		sql: `select \`id\`, \`name\` from \`${getTableName(users)}\` group by \`${getTableName(users)}\`.\`id\`, \`${
			getTableName(users)
		}\`.\`name\``,
		params: [],
	});
});

test.concurrent('build query insert with onDuplicate', async ({ db, push }) => {
	const users = mysqlTable('users_on_duplicate_255', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	const query = db.insert(users)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onDuplicateKeyUpdate({ set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql: `insert into \`${
			getTableName(users)
		}\` (\`id\`, \`name\`, \`verified\`, \`jsonb\`, \`created_at\`) values (default, ?, default, ?, default) on duplicate key update \`name\` = ?`,
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test.concurrent('insert with onDuplicate', async ({ db, push }) => {
	const users = mysqlTable('users_on_duplicate_test_256', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users)
		.values({ name: 'John' });

	await db.insert(users)
		.values({ id: 1, name: 'John' })
		.onDuplicateKeyUpdate({ set: { name: 'John1' } });

	const res = await db.select({ id: users.id, name: users.name }).from(users).where(
		eq(users.id, 1),
	);

	expect(res).toEqual([{ id: 1, name: 'John1' }]);
});

test.concurrent('insert conflict', async ({ db, push }) => {
	const users = mysqlTable('users_conflict_257', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users)
		.values({ name: 'John' });

	await expect((async () => {
		db.insert(users).values({ id: 1, name: 'John1' });
	})()).resolves.not.toThrowError();
});

test.concurrent('insert conflict with ignore', async ({ db, push }) => {
	const users = mysqlTable('users_conflict_ignore_258', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users)
		.values({ name: 'John' });

	await db.insert(users)
		.ignore()
		.values({ id: 1, name: 'John1' });

	const res = await db.select({ id: users.id, name: users.name }).from(users).where(
		eq(users.id, 1),
	);

	expect(res).toEqual([{ id: 1, name: 'John' }]);
});

test.concurrent('insert sql', async ({ db, push }) => {
	const users = mysqlTable('users_insert_sql_561', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: sql`${'John'}` });
	const result = await db.select({ id: users.id, name: users.name }).from(users);
	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test.concurrent('partial join with alias', async ({ db, push }) => {
	const users = mysqlTable('users_partial_join_567', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	const customerAlias = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select({
			user: {
				id: users.id,
				name: users.name,
			},
			customer: {
				id: customerAlias.id,
				name: customerAlias.name,
			},
		}).from(users)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(users.id, 10));

	expect(result).toEqual([{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test.concurrent('full join with alias', async ({ db, push }) => {
	const mysqlTableLocal = mysqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTableLocal('users_full_join_591', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await push({ users });
	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select().from(users)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(users.id, 10));

	expect(result).toEqual([{
		users_full_join_591: {
			id: 10,
			name: 'Ivan',
		},
		customer: {
			id: 11,
			name: 'Hans',
		},
	}]);
});

test.concurrent('select from alias', async ({ db, push }) => {
	const mysqlTableLocal = mysqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTableLocal('users_select_alias_638', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await push({ users });
	const user = alias(users, 'user');
	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select()
		.from(user)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(user.id, 10));

	expect(result).toEqual([{
		user: {
			id: 10,
			name: 'Ivan',
		},
		customer: {
			id: 11,
			name: 'Hans',
		},
	}]);
});

test.concurrent('insert with spaces', async ({ db, push }) => {
	const users = mysqlTable('users_insert_spaces_669', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: sql`'Jo   h     n'` });
	const result = await db.select({ id: users.id, name: users.name }).from(users);

	expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
});

test.concurrent('prepared statement', async ({ db, push }) => {
	const users = mysqlTable('users_prepared_676', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const statement = db.select({
		id: users.id,
		name: users.name,
	}).from(users)
		.prepare();
	const result = await statement.execute();

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test.concurrent('prepared statement reuse', async ({ db, push }) => {
	const users = mysqlTable('users_prepared_reuse_688', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	const stmt = db.insert(users).values({
		verified: true,
		name: sql.placeholder('name'),
	}).prepare();

	for (let i = 0; i < 10; i++) {
		await stmt.execute({ name: `John ${i}` });
	}

	const result = await db.select({
		id: users.id,
		name: users.name,
		verified: users.verified,
	}).from(users);

	expect(result).toEqual([
		{ id: 1, name: 'John 0', verified: true },
		{ id: 2, name: 'John 1', verified: true },
		{ id: 3, name: 'John 2', verified: true },
		{ id: 4, name: 'John 3', verified: true },
		{ id: 5, name: 'John 4', verified: true },
		{ id: 6, name: 'John 5', verified: true },
		{ id: 7, name: 'John 6', verified: true },
		{ id: 8, name: 'John 7', verified: true },
		{ id: 9, name: 'John 8', verified: true },
		{ id: 10, name: 'John 9', verified: true },
	]);
});

test.concurrent('prepared statement with placeholder in .where', async ({ db, push }) => {
	const users = mysqlTable('users_745', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values({ name: 'John' });
	const stmt = db.select({
		id: users.id,
		name: users.name,
	}).from(users)
		.where(eq(users.id, sql.placeholder('id')))
		.prepare();
	const result = await stmt.execute({ id: 1 });

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test.concurrent('migrator', async ({ db, push }) => {
	const usersMigratorTable = mysqlTableRaw('users12_758', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
		email: text('email').notNull(),
	}, (table) => [uniqueIndex('name_unique_idx').on(table.name).using('btree')]);

	await push({ usersMigratorTable });
	await migrate(db, { migrationsFolder: './drizzle2/mysql' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
});

test.concurrent('insert via db.execute + select via db.execute', async ({ db, push }) => {
	const users = mysqlTable('users_788', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.execute(sql`insert into ${users} (${new Name(users.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${users}`);
	expect(result[0]).toEqual([{ id: 1, name: 'John' }]);
});

test.concurrent('insert via db.execute w/ query builder', async ({ db, push }) => {
	const users = mysqlTable('users_795', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	const inserted = await db.execute(
		db.insert(users).values({ name: 'John' }),
	);
	expect(inserted[0].affectedRows).toBe(1);
});

test.concurrent('insert + select all possible dates', async ({ db, push }) => {
	const datesTable = mysqlTable('datestable_802', {
		date: date('date'),
		dateAsString: date('date_as_string', { mode: 'string' }),
		time: time('time', { fsp: 1 }),
		datetime: datetime('datetime', { fsp: 2 }),
		datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
		year: year('year'),
	});

	await push({ datesTable });

	const d = new Date('2022-11-11');

	await db.insert(datesTable).values({
		date: d,
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: d,
		year: 22,
		datetimeAsString: '2022-11-11 12:12:12',
	});

	const res = await db.select().from(datesTable);

	expect(res[0]?.date).toBeInstanceOf(Date);
	expect(res[0]?.datetime).toBeInstanceOf(Date);
	expect(typeof res[0]?.dateAsString).toBe('string');
	expect(typeof res[0]?.datetimeAsString).toBe('string');

	expect(res).toEqual([{
		date: toLocalDate(new Date('2022-11-11')),
		dateAsString: '2022-11-11',
		time: '12:12:12.0',
		datetime: new Date('2022-11-11'),
		year: 2022,
		datetimeAsString: '2022-11-11 12:12:12.00',
	}]);
});

test.concurrent('Mysql enum test case #1', async ({ db, push }) => {
	const tableWithEnums = mysqlTable('enums_test_case_856', {
		id: serial('id').primaryKey(),
		enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
		enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
		enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
	});

	await push({ tableWithEnums });

	await db.insert(tableWithEnums).values([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a' },
	]);

	const res = await db.select().from(tableWithEnums);

	expect(res).toEqual([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
	]);
});

test.concurrent('left join (flat object fields)', async ({ db, push }) => {
	const users2 = mysqlTable('users2_892', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	const cities = mysqlTable('cities_892', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await push({ users2, cities });
	await db.insert(cities)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select({
		userId: users2.id,
		userName: users2.name,
		cityId: cities.id,
		cityName: cities.name,
	}).from(users2)
		.leftJoin(cities, eq(users2.cityId, cities.id));

	expect(res).toEqual([
		{ userId: 1, userName: 'John', cityId: 1, cityName: 'Paris' },
		{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
	]);
});

test.concurrent('left join (grouped fields)', async ({ db, push }) => {
	const users2 = mysqlTable('users2_912', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	const cities = mysqlTable('cities_912', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await push({ users2, cities });
	await db.insert(cities)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select({
		id: users2.id,
		user: {
			name: users2.name,
			nameUpper: sql<string>`upper(${users2.name})`,
		},
		city: {
			id: cities.id,
			name: cities.name,
			nameUpper: sql<string>`upper(${cities.name})`,
		},
	}).from(users2)
		.leftJoin(cities, eq(users2.cityId, cities.id));

	expect(res).toEqual([
		{
			id: 1,
			user: { name: 'John', nameUpper: 'JOHN' },
			city: { id: 1, name: 'Paris', nameUpper: 'PARIS' },
		},
		{
			id: 2,
			user: { name: 'Jane', nameUpper: 'JANE' },
			city: null,
		},
	]);
});

test.concurrent('left join (all fields)', async ({ db, push }) => {
	const users2 = mysqlTable('users2_946', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	const cities = mysqlTable('cities_946', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await push({ users2, cities });
	await db.insert(cities)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select().from(users2)
		.leftJoin(cities, eq(users2.cityId, cities.id));

	expect(res).toEqual([
		{
			users2_946: {
				id: 1,
				name: 'John',
				cityId: 1,
			},
			cities_946: {
				id: 1,
				name: 'Paris',
			},
		},
		{
			users2_946: {
				id: 2,
				name: 'Jane',
				cityId: null,
			},
			cities_946: null,
		},
	]);
});

test.concurrent('join subquery', async ({ db, push }) => {
	const coursesTable = mysqlTable('courses_978', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		categoryId: bigint('category_id', { mode: 'number', unsigned: true }).references(() => courseCategoriesTable.id),
	});

	const courseCategoriesTable = mysqlTable('course_categories_978', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await push({ coursesTable, courseCategoriesTable });

	await db.insert(courseCategoriesTable).values([
		{ name: 'Category 1' },
		{ name: 'Category 2' },
		{ name: 'Category 3' },
		{ name: 'Category 4' },
	]);

	await db.insert(coursesTable).values([
		{ name: 'Development', categoryId: 2 },
		{ name: 'IT & Software', categoryId: 3 },
		{ name: 'Marketing', categoryId: 4 },
		{ name: 'Design', categoryId: 1 },
	]);

	const sq2 = db
		.select({
			categoryId: courseCategoriesTable.id,
			category: courseCategoriesTable.name,
			total: sql<number>`count(${courseCategoriesTable.id})`,
		})
		.from(courseCategoriesTable)
		.groupBy(courseCategoriesTable.id, courseCategoriesTable.name)
		.as('sq2');

	const res = await db
		.select({
			courseName: coursesTable.name,
			categoryId: sq2.categoryId,
		})
		.from(coursesTable)
		.leftJoin(sq2, eq(coursesTable.categoryId, sq2.categoryId))
		.orderBy(coursesTable.name);

	expect(res).toEqual([
		{ courseName: 'Design', categoryId: 1 },
		{ courseName: 'Development', categoryId: 2 },
		{ courseName: 'IT & Software', categoryId: 3 },
		{ courseName: 'Marketing', categoryId: 4 },
	]);
});

test.concurrent('with ... select', async ({ db, push }) => {
	const orders = mysqlTable('orders_1056', {
		id: serial('id').primaryKey(),
		region: text('region').notNull(),
		product: text('product').notNull(),
		amount: int('amount').notNull(),
		quantity: int('quantity').notNull(),
	});

	await push({ orders });

	await db.insert(orders).values([
		{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
		{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 50, quantity: 5 },
	]);

	const regionalSales = db
		.$with('regional_sales')
		.as(
			db
				.select({
					region: orders.region,
					totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
				})
				.from(orders)
				.groupBy(orders.region),
		);

	const topRegions = db
		.$with('top_regions')
		.as(
			db
				.select({
					region: regionalSales.region,
				})
				.from(regionalSales)
				.where(
					gt(
						regionalSales.totalSales,
						db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
					),
				),
		);

	const result = await db
		.with(regionalSales, topRegions)
		.select({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`cast(sum(${orders.quantity}) as unsigned)`,
			productSales: sql<number>`cast(sum(${orders.amount}) as unsigned)`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product);

	expect(result).toEqual([
		{
			region: 'Europe',
			product: 'A',
			productUnits: 3,
			productSales: 30,
		},
		{
			region: 'Europe',
			product: 'B',
			productUnits: 5,
			productSales: 50,
		},
		{
			region: 'US',
			product: 'A',
			productUnits: 7,
			productSales: 70,
		},
		{
			region: 'US',
			product: 'B',
			productUnits: 9,
			productSales: 90,
		},
	]);
});

test.concurrent('select from subquery sql', async ({ db, push }) => {
	const users2 = mysqlTable('users2_1160', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	await push({ users2 });
	await db.insert(users2).values([{ name: 'John' }, { name: 'Jane' }]);

	const sq = db
		.select({ name: sql<string>`concat(${users2.name}, " modified")`.as('name') })
		.from(users2)
		.as('sq');

	const res = await db.select({ name: sq.name }).from(sq);

	expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
});

test.concurrent('select a field without joining its table', ({ db }) => {
	const users = mysqlTable('users_1173', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	const users2 = mysqlTable('users2_1173', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	expect(() => db.select({ name: users2.name }).from(users).prepare()).toThrowError();
});

test.concurrent('select all fields from subquery without alias', ({ db }) => {
	const users2 = mysqlTable('users2_1177', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2.name})` }).from(users2));

	expect(() => db.select().from(sq).prepare()).toThrowError();
});

test.concurrent('select count()', async ({ db, push }) => {
	const users = mysqlTable('users_1183', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);

	const res = await db.select({ count: sql`count(*)` }).from(users);

	expect(res).toEqual([{ count: 2 }]);
});

test.concurrent('select for ...', ({ db }) => {
	const users2 = mysqlTable('users2_1191', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	{
		const query = db.select().from(users2).for('update').toSQL();
		expect(query.sql).toMatch(/ for update$/);
	}
	{
		const query = db.select().from(users2).for('share', { skipLocked: true }).toSQL();
		expect(query.sql).toMatch(/ for share skip locked$/);
	}
	{
		const query = db.select().from(users2).for('update', { noWait: true }).toSQL();
		expect(query.sql).toMatch(/ for update nowait$/);
	}
});

test.concurrent('having', async ({ db, push }) => {
	const users2 = mysqlTable('users2_1206', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	const cities = mysqlTable('cities_1206', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await push({ users2, cities });
	await db.insert(cities).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]);

	await db.insert(users2).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 1 }, {
		name: 'Jack',
		cityId: 2,
	}]);

	const result = await db
		.select({
			id: cities.id,
			name: sql<string>`upper(${cities.name})`.as('upper_name'),
			usersCount: sql<number>`count(${users2.id})`.as('users_count'),
		})
		.from(cities)
		.leftJoin(users2, eq(users2.cityId, cities.id))
		.where(({ name }) => sql`length(${name}) >= 3`)
		.groupBy(cities.id)
		.having(({ usersCount }) => sql`${usersCount} > 0`)
		.orderBy(({ name }) => name);

	expect(result).toEqual([
		{
			id: 1,
			name: 'LONDON',
			usersCount: 2,
		},
		{
			id: 2,
			name: 'PARIS',
			usersCount: 1,
		},
	]);
});

test.concurrent('view', async ({ db, push }) => {
	const users2 = mysqlTable('users2_1241', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	const cities = mysqlTable('cities_1241', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	const newYorkers1 = mysqlView('new_yorkers_1241')
		.as((qb) => qb.select().from(users2).where(eq(users2.cityId, 1)));

	const newYorkers2 = mysqlView('new_yorkers_1241', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).as(sql`select * from ${users2} where ${eq(users2.cityId, 1)}`);

	const newYorkers3 = mysqlView('new_yorkers_1241', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).existing();

	await push({ users2, cities });
	await db.execute(sql`create view new_yorkers_1241 as ${getViewConfig(newYorkers1).query}`);

	await db.insert(cities).values([{ name: 'New York' }, { name: 'Paris' }]);

	await db.insert(users2).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]);

	{
		const result = await db.select().from(newYorkers1);
		expect(result).toEqual([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers2);
		expect(result).toEqual([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers3);
		expect(result).toEqual([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
		expect(result).toEqual([
			{ name: 'John' },
			{ name: 'Jane' },
		]);
	}

	await db.execute(sql`drop view ${newYorkers1}`);
});

test.concurrent('select from raw sql', async ({ db }) => {
	const result = await db.select({
		id: sql<number>`id`,
		name: sql<string>`name`,
	}).from(sql`(select 1 as id, 'John' as name) as users`);

	Expect<Equal<{ id: number; name: string }[], typeof result>>;

	expect(result).toEqual([
		{ id: 1, name: 'John' },
	]);
});

test.concurrent('select from raw sql with joins', async ({ db }) => {
	const result = await db
		.select({
			id: sql<number>`users.id`,
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`);

	Expect<Equal<{ id: number; name: string; userCity: string; cityName: string }[], typeof result>>;

	expect(result).toEqual([
		{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
	]);
});

test.concurrent('join on aliased sql from select', async ({ db }) => {
	const result = await db
		.select({
			userId: sql<number>`users.id`.as('userId'),
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityId: sql<number>`cities.id`.as('cityId'),
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId));

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	expect(result).toEqual([
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test.concurrent('join on aliased sql from with clause', async ({ db }) => {
	const users = db.$with('users').as(
		db.select({
			id: sql<number>`id`.as('userId'),
			name: sql<string>`name`.as('userName'),
			city: sql<string>`city`.as('city'),
		}).from(
			sql`(select 1 as id, 'John' as name, 'New York' as city) as users`,
		),
	);

	const cities = db.$with('cities').as(
		db.select({
			id: sql<number>`id`.as('cityId'),
			name: sql<string>`name`.as('cityName'),
		}).from(
			sql`(select 1 as id, 'Paris' as name) as cities`,
		),
	);

	const result = await db
		.with(users, cities)
		.select({
			userId: users.id,
			name: users.name,
			userCity: users.city,
			cityId: cities.id,
			cityName: cities.name,
		})
		.from(users)
		.leftJoin(cities, (cols) => eq(cols.cityId, cols.userId));

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	expect(result).toEqual([
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test.concurrent('prefixed table', async ({ db, push }) => {
	const mysqlTable = mysqlTableCreator((name) => `myprefix_${name}`);

	const users = mysqlTable('test_prefixed_table_with_unique_name_1450', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
	});

	await push({ users });
	await db.insert(users).values({ id: 1, name: 'John' });

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test.concurrent('orderBy with aliased column', ({ db }) => {
	const users2 = mysqlTable('users2_1473', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id'),
	});

	const query = db.select({
		test: sql`something`.as('test'),
	}).from(users2).orderBy((fields) => fields.test).toSQL();

	expect(query.sql).toBe(`select something as \`test\` from \`${getTableName(users2)}\` order by \`test\``);
});

test.concurrent('timestamp timezone', async ({ db, push }) => {
	const users = mysqlTable('users_1481', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	await push({ users });
	const date = new Date(Date.parse('2020-01-01T12:34:56+07:00'));

	await db.insert(users).values({ name: 'With default times' });
	await db.insert(users).values({
		name: 'Without default times',
		createdAt: date,
	});
	const usersResult = await db.select().from(users);

	// check that the timestamps are set correctly for default times
	expect(Math.abs(usersResult[0]!.createdAt.getTime() - Date.now())).toBeLessThan(2000);

	// check that the timestamps are set correctly for non default times
	expect(Math.abs(usersResult[1]!.createdAt.getTime() - date.getTime())).toBeLessThan(2000);
});

test('transaction', async ({ db, push }) => {
	const users = mysqlTable('users_transactions_1498', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});
	const products = mysqlTable('products_transactions_1498', {
		id: serial('id').primaryKey(),
		price: int('price').notNull(),
		stock: int('stock').notNull(),
	});

	await push({ users, products });

	const [{ insertId: userId }] = await db.insert(users).values({ balance: 100 });
	const user = await db.select().from(users).where(eq(users.id, userId)).then((rows) => rows[0]!);
	const [{ insertId: productId }] = await db.insert(products).values({ price: 10, stock: 10 });
	const product = await db.select().from(products).where(eq(products.id, productId)).then((rows) => rows[0]!);

	await db.transaction(async (tx) => {
		await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
		await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
	});

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, balance: 90 }]);
});

test.concurrent('transaction rollback', async ({ db, push }) => {
	const users = mysqlTable('users_transactions_rollback_1535', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await push({ users });

	await expect((async () => {
		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });
			tx.rollback();
		});
	})()).rejects.toThrowError(TransactionRollbackError);

	const result = await db.select().from(users);

	expect(result).toEqual([]);
});

test('nested transaction', async ({ db, push }) => {
	const users = mysqlTable('users_nested_transactions_1561', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await push({ users });

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await tx.transaction(async (tx) => {
			await tx.update(users).set({ balance: 200 });
		});
	});

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, balance: 200 }]);
});

test('nested transaction rollback', async ({ db, push }) => {
	const users = mysqlTable('users_nested_transactions_rollback_1588', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await push({ users });

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await expect((async () => {
			await tx.transaction(async (tx) => {
				await tx.update(users).set({ balance: 200 });
				tx.rollback();
			});
		})()).rejects.toThrowError(TransactionRollbackError);
	});

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, balance: 100 }]);
});

test.concurrent('join subquery with join', async ({ db, push }) => {
	const internalStaff = mysqlTable('internal_staff_1618', {
		userId: int('user_id').notNull(),
	});

	const customUser = mysqlTable('custom_user_1618', {
		id: int('id').notNull(),
	});

	const ticket = mysqlTable('ticket_1618', {
		staffId: int('staff_id').notNull(),
	});

	await push({ internalStaff, customUser, ticket });

	await db.insert(internalStaff).values({ userId: 1 });
	await db.insert(customUser).values({ id: 1 });
	await db.insert(ticket).values({ staffId: 1 });

	const subq = db
		.select()
		.from(internalStaff)
		.leftJoin(customUser, eq(internalStaff.userId, customUser.id))
		.as('internal_staff');

	const mainQuery = await db
		.select()
		.from(ticket)
		.leftJoin(subq, eq(subq.internal_staff_1618.userId, ticket.staffId));

	expect(mainQuery).toEqual([{
		ticket_1618: { staffId: 1 },
		internal_staff: {
			internal_staff_1618: { userId: 1 },
			custom_user_1618: { id: 1 },
		},
	}]);
});

test.concurrent('subquery with view', async ({ db, push }) => {
	const users = mysqlTable('users_subquery_view_1667', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	});

	const newYorkers = mysqlView('new_yorkers_1667').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await push({ users });
	await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

	await db.insert(users).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 2 },
		{ name: 'Jack', cityId: 1 },
		{ name: 'Jill', cityId: 2 },
	]);

	const sq = db.$with('sq').as(db.select().from(newYorkers));
	const result = await db.with(sq).select().from(sq);

	await db.execute(sql`drop view ${newYorkers}`);

	expect(result).toEqual([
		{ id: 1, name: 'John', cityId: 1 },
		{ id: 3, name: 'Jack', cityId: 1 },
	]);
});

test.concurrent('join view as subquery', async ({ db, push }) => {
	const users = mysqlTable('users_join_view_1703', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	});

	const newYorkers = mysqlView('new_yorkers_1703').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await push({ users });
	await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

	await db.insert(users).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 2 },
		{ name: 'Jack', cityId: 1 },
		{ name: 'Jill', cityId: 2 },
	]);

	const sq = db.select().from(newYorkers).as('new_yorkers_sq');

	const result = await db.select().from(users).leftJoin(sq, eq(users.id, sq.id));

	expect(result).toEqual([
		{
			users_join_view_1703: { id: 1, name: 'John', cityId: 1 },
			new_yorkers_sq: { id: 1, name: 'John', cityId: 1 },
		},
		{
			users_join_view_1703: { id: 2, name: 'Jane', cityId: 2 },
			new_yorkers_sq: null,
		},
		{
			users_join_view_1703: { id: 3, name: 'Jack', cityId: 1 },
			new_yorkers_sq: { id: 3, name: 'Jack', cityId: 1 },
		},
		{
			users_join_view_1703: { id: 4, name: 'Jill', cityId: 2 },
			new_yorkers_sq: null,
		},
	]);

	await db.execute(sql`drop view ${newYorkers}`);
});

test.concurrent('select iterator', async ({ db, push }) => {
	const users = mysqlTable('users_iterator_1754', {
		id: serial('id').primaryKey(),
	});

	await push({ users });
	await db.insert(users).values([{}, {}, {}]);

	const iter = db.select().from(users).iterator();

	const result: typeof users.$inferSelect[] = [];

	for await (const row of iter) {
		result.push(row);
	}

	expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test.concurrent('select iterator w/ prepared statement', async ({ db, push }) => {
	const users = mysqlTable('users_iterator_1775', {
		id: serial('id').primaryKey(),
	});

	await push({ users });
	await db.insert(users).values([{}, {}, {}]);

	const prepared = db.select().from(users).prepare();
	const iter = prepared.iterator();
	const result: typeof users.$inferSelect[] = [];

	for await (const row of iter) {
		result.push(row);
	}

	expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test.concurrent('insert undefined', async ({ db, push }) => {
	const users = mysqlTable('users_1796', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await push({ users });

	await expect((async () => {
		await db.insert(users).values({ name: undefined });
	})()).resolves.not.toThrowError();
});

test.concurrent('update undefined', async ({ db, push }) => {
	const users = mysqlTable('users_1815', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await push({ users });

	await expect((async () => {
		await db.update(users).set({ name: undefined });
	})()).rejects.toThrowError();

	await expect((async () => {
		await db.update(users).set({ id: 1, name: undefined });
	})()).resolves.not.toThrowError();
});
