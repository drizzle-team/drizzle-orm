import { expect, test } from 'vitest';
import { drizzle } from '~/libsql';
import { type SQL, sql } from '~/sql';
import { type AnySQLiteColumn, int, primaryKey, type SQLiteColumn, sqliteTable, sqliteView, text } from '~/sqlite-core';
import { TableName } from '~/table';
import { getColumns } from '~/utils';
import { type Equal, Expect } from '../type-tests/utils';

export const usersTable = sqliteTable('users', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
	verified: int('verified', { mode: 'boolean' }).notNull().default(false),
	invitedBy: int('invited_by').references((): AnySQLiteColumn => usersTable.id),
});

export const groupsTable = sqliteTable('groups', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});

export const usersToGroupsTable = sqliteTable(
	'users_to_groups',
	{
		id: int('id'),
		userId: int('user_id').notNull().references(() => usersTable.id),
		groupId: int('group_id').notNull().references(() => groupsTable.id),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.groupId] }),
	}),
);

export const postsTable = sqliteTable('posts', {
	id: int('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: int('owner_id').references(
		() => usersTable.id,
	),
	createdAt: int('created_at', { mode: 'timestamp_ms' })
		.notNull(),
});

test('Gets the columns from a table', () => {
	const columns = getColumns(usersTable);

	Expect<
		Equal<typeof columns, {
			id: SQLiteColumn<{
				name: 'id';
				tableName: 'users';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: SQLiteColumn<{
				name: 'name';
				tableName: 'users';
				dataType: 'string';
				columnType: 'SQLiteText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			verified: SQLiteColumn<{
				name: 'verified';
				tableName: 'users';
				dataType: 'boolean';
				columnType: 'SQLiteBoolean';
				data: boolean;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			invitedBy: SQLiteColumn<{
				name: 'invited_by';
				tableName: 'users';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
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
			id: SQLiteColumn<{
				name: 'id';
				tableName: 'sq';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: SQLiteColumn<{
				name: 'name';
				tableName: 'sq';
				dataType: 'string';
				columnType: 'SQLiteText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			verified: SQLiteColumn<{
				name: 'verified';
				tableName: 'sq';
				dataType: 'boolean';
				columnType: 'SQLiteBoolean';
				data: boolean;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			invitedBy: SQLiteColumn<{
				name: 'invited_by';
				tableName: 'sq';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
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
		id: 'SQLiteInteger',
		name: 'SQLiteText',
		verified: 'SQLiteBoolean',
		invitedBy: 'SQLiteInteger',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('sq');
});

test('Gets the columns from a View', () => {
	const view = sqliteView('usersView').as((qb) => qb.select().from(usersTable).where(sql`true`));

	const columns = getColumns(view);

	Expect<
		Equal<typeof columns, {
			id: SQLiteColumn<{
				name: 'id';
				tableName: 'usersView';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: SQLiteColumn<{
				name: 'name';
				tableName: 'usersView';
				dataType: 'string';
				columnType: 'SQLiteText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			verified: SQLiteColumn<{
				name: 'verified';
				tableName: 'usersView';
				dataType: 'boolean';
				columnType: 'SQLiteBoolean';
				data: boolean;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			invitedBy: SQLiteColumn<{
				name: 'invited_by';
				tableName: 'usersView';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
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
		id: 'SQLiteInteger',
		name: 'SQLiteText',
		verified: 'SQLiteBoolean',
		invitedBy: 'SQLiteInteger',
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
			id: SQLiteColumn<{
				name: 'id';
				tableName: 'CTE';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: SQLiteColumn<{
				name: 'name';
				tableName: 'CTE';
				dataType: 'string';
				columnType: 'SQLiteText';
				data: string;
				driverParam: string;
				notNull: true;
				hasDefault: false;
				enumValues: [string, ...string[]];
				baseColumn: never;
			}, object>;
			verified: SQLiteColumn<{
				name: 'verified';
				tableName: 'CTE';
				dataType: 'boolean';
				columnType: 'SQLiteBoolean';
				data: boolean;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			invitedBy: SQLiteColumn<{
				name: 'invited_by';
				tableName: 'CTE';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
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
		id: 'SQLiteInteger',
		name: 'SQLiteText',
		verified: 'SQLiteBoolean',
		invitedBy: 'SQLiteInteger',
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
			id: SQLiteColumn<{
				name: 'id';
				tableName: 'sq';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: SQLiteColumn<{
				name: 'name';
				tableName: 'sq';
				dataType: 'string';
				columnType: 'SQLiteText';
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
		id: 'SQLiteInteger',
		name: 'SQLiteText',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('sq');
});

test('Gets the columns from a View with sql', () => {
	const view = sqliteView('usersView').as((qb) =>
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
			id: SQLiteColumn<{
				name: 'id';
				tableName: 'usersView';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: SQLiteColumn<{
				name: 'name';
				tableName: 'usersView';
				dataType: 'string';
				columnType: 'SQLiteText';
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
		id: 'SQLiteInteger',
		name: 'SQLiteText',
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
			id: SQLiteColumn<{
				name: 'id';
				tableName: 'CTE';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
			}, object>;
			name: SQLiteColumn<{
				name: 'name';
				tableName: 'CTE';
				dataType: 'string';
				columnType: 'SQLiteText';
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
		id: 'SQLiteInteger',
		name: 'SQLiteText',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('CTE');
});
