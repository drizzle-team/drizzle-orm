import { expect, test } from 'vitest';
import {
	type AnyMySqlColumn,
	bigint,
	boolean,
	type MySqlColumn,
	mysqlTable,
	mysqlView,
	primaryKey,
	serial,
	text,
	timestamp,
} from '~/mysql-core';
import { drizzle } from '~/mysql2';
import { type SQL, sql } from '~/sql';
import { TableName } from '~/table';
import { getColumns } from '~/utils';
import { type Equal, Expect } from '../type-tests/utils';

export const usersTable = mysqlTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: bigint('invited_by', { mode: 'number' }).references(
		(): AnyMySqlColumn => usersTable.id,
	),
});

export const groupsTable = mysqlTable('groups', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});

export const usersToGroupsTable = mysqlTable(
	'users_to_groups',
	{
		id: serial('id'),
		userId: bigint('user_id', { mode: 'number' }).notNull().references(
			() => usersTable.id,
		),
		groupId: bigint('group_id', { mode: 'number' }).notNull().references(
			() => groupsTable.id,
		),
	},
	(t) => ({
		pk: primaryKey({
			columns: [t.userId, t.groupId],
		}),
	}),
);

export const postsTable = mysqlTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: bigint('owner_id', { mode: 'number' }).references(
		() => usersTable.id,
	),
	createdAt: timestamp('created_at')
		.notNull()
		.defaultNow(),
});

test('Gets the columns from a table', () => {
	const columns = getColumns(usersTable);

	Expect<
		Equal<typeof columns, {
			id: MySqlColumn<{
				name: 'id';
				tableName: 'users';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: MySqlColumn<{
				name: 'name';
				tableName: 'users';
				dataType: 'string';
				columnType: 'MySqlText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			verified: MySqlColumn<{
				name: 'verified';
				tableName: 'users';
				dataType: 'boolean';
				columnType: 'MySqlBoolean';
				data: boolean;
				driverParam: number | boolean;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			invitedBy: MySqlColumn<{
				name: 'invited_by';
				tableName: 'users';
				dataType: 'number';
				columnType: 'MySqlBigInt53';
				data: number;
				driverParam: string | number;
				notNull: false;
				hasDefault: false;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
		}>
	>();

	expect(columns).toEqual({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
		invitedBy: usersTable.invitedBy,
	});
});

test('Gets the columns from a subquery', () => {
	const db = drizzle({} as any);
	const subquery = db.select().from(usersTable).where(sql`true`).as('sq');

	const columns = getColumns(subquery);

	Expect<
		Equal<typeof columns, {
			id: MySqlColumn<{
				name: 'id';
				tableName: 'sq';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: MySqlColumn<{
				name: 'name';
				tableName: 'sq';
				dataType: 'string';
				columnType: 'MySqlText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			verified: MySqlColumn<{
				name: 'verified';
				tableName: 'sq';
				dataType: 'boolean';
				columnType: 'MySqlBoolean';
				data: boolean;
				driverParam: number | boolean;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			invitedBy: MySqlColumn<{
				name: 'invited_by';
				tableName: 'sq';
				dataType: 'number';
				columnType: 'MySqlBigInt53';
				data: number;
				driverParam: string | number;
				notNull: false;
				hasDefault: false;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
		}>
	>();

	const columnNames = {
		id: columns.id.name,
		name: columns.name.name,
		verified: columns.verified.name,
		invitedBy: columns.invitedBy.name,
	};

	expect(columnNames).toEqual({
		id: 'id',
		name: 'name',
		verified: 'verified',
		invitedBy: 'invited_by',
	});

	const columnTypes = {
		id: columns.id.columnType,
		name: columns.name.columnType,
		verified: columns.verified.columnType,
		invitedBy: columns.invitedBy.columnType,
	};

	expect(columnTypes).toEqual({
		id: 'MySqlSerial',
		name: 'MySqlText',
		verified: 'MySqlBoolean',
		invitedBy: 'MySqlBigInt53',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('sq');
});

test('Gets the columns from a View', () => {
	const view = mysqlView('usersView').as((qb) => qb.select().from(usersTable).where(sql`true`));

	const columns = getColumns(view);

	Expect<
		Equal<typeof columns, {
			id: MySqlColumn<{
				name: 'id';
				tableName: 'usersView';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: MySqlColumn<{
				name: 'name';
				tableName: 'usersView';
				dataType: 'string';
				columnType: 'MySqlText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			verified: MySqlColumn<{
				name: 'verified';
				tableName: 'usersView';
				dataType: 'boolean';
				columnType: 'MySqlBoolean';
				data: boolean;
				driverParam: number | boolean;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			invitedBy: MySqlColumn<{
				name: 'invited_by';
				tableName: 'usersView';
				dataType: 'number';
				columnType: 'MySqlBigInt53';
				data: number;
				driverParam: string | number;
				notNull: false;
				hasDefault: false;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
		}>
	>;

	const columnNames = {
		id: columns.id.name,
		name: columns.name.name,
		verified: columns.verified.name,
		invitedBy: columns.invitedBy.name,
	};

	expect(columnNames).toEqual({
		id: 'id',
		name: 'name',
		verified: 'verified',
		invitedBy: 'invited_by',
	});

	const columnTypes = {
		id: columns.id.columnType,
		name: columns.name.columnType,
		verified: columns.verified.columnType,
		invitedBy: columns.invitedBy.columnType,
	};

	expect(columnTypes).toEqual({
		id: 'MySqlSerial',
		name: 'MySqlText',
		verified: 'MySqlBoolean',
		invitedBy: 'MySqlBigInt53',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('usersView');
});

test('Gets the columns from a CTE', () => {
	const db = drizzle({} as any);
	const CTE = db.$with('CTE').as((qb) => qb.select().from(usersTable).where(sql`true`));

	const columns = getColumns(CTE);

	Expect<
		Equal<typeof columns, {
			id: MySqlColumn<{
				name: 'id';
				tableName: 'CTE';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: MySqlColumn<{
				name: 'name';
				tableName: 'CTE';
				dataType: 'string';
				columnType: 'MySqlText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			verified: MySqlColumn<{
				name: 'verified';
				tableName: 'CTE';
				dataType: 'boolean';
				columnType: 'MySqlBoolean';
				data: boolean;
				driverParam: number | boolean;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			invitedBy: MySqlColumn<{
				name: 'invited_by';
				tableName: 'CTE';
				dataType: 'number';
				columnType: 'MySqlBigInt53';
				data: number;
				driverParam: string | number;
				notNull: false;
				hasDefault: false;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
		}>
	>();

	const columnNames = {
		id: columns.id.name,
		name: columns.name.name,
		verified: columns.verified.name,
		invitedBy: columns.invitedBy.name,
	};

	expect(columnNames).toEqual({
		id: 'id',
		name: 'name',
		verified: 'verified',
		invitedBy: 'invited_by',
	});

	const columnTypes = {
		id: columns.id.columnType,
		name: columns.name.columnType,
		verified: columns.verified.columnType,
		invitedBy: columns.invitedBy.columnType,
	};

	expect(columnTypes).toEqual({
		id: 'MySqlSerial',
		name: 'MySqlText',
		verified: 'MySqlBoolean',
		invitedBy: 'MySqlBigInt53',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('CTE');
});

test('Gets the columns from a subquery with sql', () => {
	const db = drizzle({} as any);
	const subquery = db.select({
		id: usersTable.id,
		name: usersTable.name,
		lower: sql`lower(${usersTable.name})`.as('lower'), // unknown
		upper: sql<string>`upper(${usersTable.name})`.as('upper'), // string
	}).from(usersTable).where(sql`true`).as('sq');

	const columns = getColumns(subquery);

	Expect<
		Equal<typeof columns, {
			id: MySqlColumn<{
				name: 'id';
				tableName: 'sq';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: MySqlColumn<{
				name: 'name';
				tableName: 'sq';
				dataType: 'string';
				columnType: 'MySqlText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			lower: SQL.Aliased<unknown>;
			upper: SQL.Aliased<string>;
		}>
	>();

	const columnNames = {
		id: columns.id.name,
		name: columns.name.name,
		lower: columns.lower.fieldAlias,
		upper: columns.upper.fieldAlias,
	};

	expect(columnNames).toEqual({
		id: 'id',
		name: 'name',
		lower: 'lower',
		upper: 'upper',
	});

	const columnTypes = {
		id: columns.id.columnType,
		name: columns.name.columnType,
	};

	expect(columnTypes).toEqual({
		id: 'MySqlSerial',
		name: 'MySqlText',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('sq');
});

test('Gets the columns from a View with sql', () => {
	const view = mysqlView('usersView').as((qb) =>
		qb.select({
			id: usersTable.id,
			name: usersTable.name,
			lower: sql`lower(${usersTable.name})`.as('lower'), // unknown
			upper: sql<string>`upper(${usersTable.name})`.as('upper'), // unknown
		}).from(usersTable).where(sql`true`)
	);

	const columns = getColumns(view);

	Expect<
		Equal<typeof columns, {
			id: MySqlColumn<{
				name: 'id';
				tableName: 'usersView';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: MySqlColumn<{
				name: 'name';
				tableName: 'usersView';
				dataType: 'string';
				columnType: 'MySqlText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			lower: SQL.Aliased<unknown>;
			upper: SQL.Aliased<string>;
		}>
	>();

	const columnNames = {
		id: columns.id.name,
		name: columns.name.name,
		lower: columns.lower.fieldAlias,
		upper: columns.upper.fieldAlias,
	};

	expect(columnNames).toEqual({
		id: 'id',
		name: 'name',
		lower: 'lower',
		upper: 'upper',
	});

	const columnTypes = {
		id: columns.id.columnType,
		name: columns.name.columnType,
	};

	expect(columnTypes).toEqual({
		id: 'MySqlSerial',
		name: 'MySqlText',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('usersView');
});

test('Gets the columns from a CTE with sql', () => {
	const db = drizzle({} as any);
	const CTE = db.$with('CTE').as((qb) =>
		qb.select({
			id: usersTable.id,
			name: usersTable.name,
			lower: sql`lower(${usersTable.name})`.as('lower'), // unknown
			upper: sql<string>`upper(${usersTable.name})`.as('upper'), // unknown
		}).from(usersTable).where(sql`true`)
	);

	const columns = getColumns(CTE);

	Expect<
		Equal<typeof columns, {
			id: MySqlColumn<{
				name: 'id';
				tableName: 'CTE';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: MySqlColumn<{
				name: 'name';
				tableName: 'CTE';
				dataType: 'string';
				columnType: 'MySqlText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			lower: SQL.Aliased<unknown>;
			upper: SQL.Aliased<string>;
		}>
	>();

	const columnNames = {
		id: columns.id.name,
		name: columns.name.name,
		lower: columns.lower.fieldAlias,
		upper: columns.upper.fieldAlias,
	};

	expect(columnNames).toEqual({
		id: 'id',
		name: 'name',
		lower: 'lower',
		upper: 'upper',
	});

	const columnTypes = {
		id: columns.id.columnType,
		name: columns.name.columnType,
	};

	expect(columnTypes).toEqual({
		id: 'MySqlSerial',
		name: 'MySqlText',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('CTE');
});
