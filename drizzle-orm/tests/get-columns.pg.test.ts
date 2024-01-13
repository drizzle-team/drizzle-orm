import { expect, test } from 'vitest';
import {
	AnyPgColumn,
	bigint,
	boolean,
	PgColumn,
	pgTable,
	pgView,
	primaryKey,
	serial,
	text,
	timestamp,
} from '~/pg-core';
import { drizzle } from '~/postgres-js';
import { type SQL, sql } from '~/sql';
import { TableName } from '~/table';
import { getColumns, getTableColumns } from '~/utils';
import { type Equal, Expect } from '../type-tests/utils';

export const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: bigint('invited_by', { mode: 'number' }).references(
		(): AnyPgColumn => usersTable.id,
	),
});

export const groupsTable = pgTable('groups', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});

export const usersToGroupsTable = pgTable(
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

export const postsTable = pgTable('posts', {
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
			id: PgColumn<
				{
					name: 'id';
					tableName: 'users';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			name: PgColumn<
				{
					name: 'name';
					tableName: 'users';
					dataType: 'string';
					columnType: 'PgText';
					data: string;
					driverParam: string;
					notNull: true;
					hasDefault: false;
					enumValues: [string, ...string[]];
					baseColumn: never;
				},
				{},
				{}
			>;
			verified: PgColumn<
				{
					name: 'verified';
					tableName: 'users';
					dataType: 'boolean';
					columnType: 'PgBoolean';
					data: boolean;
					driverParam: boolean;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			invitedBy: PgColumn<
				{
					name: 'invited_by';
					tableName: 'users';
					dataType: 'number';
					columnType: 'PgBigInt53';
					data: number;
					driverParam: string | number;
					notNull: false;
					hasDefault: false;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
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
			id: PgColumn<
				{
					name: 'id';
					tableName: 'sq';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			name: PgColumn<
				{
					name: 'name';
					tableName: 'sq';
					dataType: 'string';
					columnType: 'PgText';
					data: string;
					driverParam: string;
					notNull: true;
					hasDefault: false;
					enumValues: [string, ...string[]];
					baseColumn: never;
				},
				{},
				{}
			>;
			verified: PgColumn<
				{
					name: 'verified';
					tableName: 'sq';
					dataType: 'boolean';
					columnType: 'PgBoolean';
					data: boolean;
					driverParam: boolean;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			invitedBy: PgColumn<
				{
					name: 'invited_by';
					tableName: 'sq';
					dataType: 'number';
					columnType: 'PgBigInt53';
					data: number;
					driverParam: string | number;
					notNull: false;
					hasDefault: false;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
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
		id: 'PgSerial',
		name: 'PgText',
		verified: 'PgBoolean',
		invitedBy: 'PgBigInt53',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('sq');
});

test('Gets the columns from a View', () => {
	const view = pgView('usersView').as((qb) => qb.select().from(usersTable).where(sql`true`));

	const columns = getColumns(view);

	Expect<
		Equal<typeof columns, {
			id: PgColumn<
				{
					name: 'id';
					tableName: 'usersView';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			name: PgColumn<
				{
					name: 'name';
					tableName: 'usersView';
					dataType: 'string';
					columnType: 'PgText';
					data: string;
					driverParam: string;
					notNull: true;
					hasDefault: false;
					enumValues: [string, ...string[]];
					baseColumn: never;
				},
				{},
				{}
			>;
			verified: PgColumn<
				{
					name: 'verified';
					tableName: 'usersView';
					dataType: 'boolean';
					columnType: 'PgBoolean';
					data: boolean;
					driverParam: boolean;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			invitedBy: PgColumn<
				{
					name: 'invited_by';
					tableName: 'usersView';
					dataType: 'number';
					columnType: 'PgBigInt53';
					data: number;
					driverParam: string | number;
					notNull: false;
					hasDefault: false;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
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
		id: 'PgSerial',
		name: 'PgText',
		verified: 'PgBoolean',
		invitedBy: 'PgBigInt53',
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
			id: PgColumn<
				{
					name: 'id';
					tableName: 'CTE';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			name: PgColumn<
				{
					name: 'name';
					tableName: 'CTE';
					dataType: 'string';
					columnType: 'PgText';
					data: string;
					driverParam: string;
					notNull: true;
					hasDefault: false;
					enumValues: [string, ...string[]];
					baseColumn: never;
				},
				{},
				{}
			>;
			verified: PgColumn<
				{
					name: 'verified';
					tableName: 'CTE';
					dataType: 'boolean';
					columnType: 'PgBoolean';
					data: boolean;
					driverParam: boolean;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			invitedBy: PgColumn<
				{
					name: 'invited_by';
					tableName: 'CTE';
					dataType: 'number';
					columnType: 'PgBigInt53';
					data: number;
					driverParam: string | number;
					notNull: false;
					hasDefault: false;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
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
		id: 'PgSerial',
		name: 'PgText',
		verified: 'PgBoolean',
		invitedBy: 'PgBigInt53',
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
			id: PgColumn<
				{
					name: 'id';
					tableName: 'sq';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			name: PgColumn<
				{
					name: 'name';
					tableName: 'sq';
					dataType: 'string';
					columnType: 'PgText';
					data: string;
					driverParam: string;
					notNull: true;
					hasDefault: false;
					enumValues: [string, ...string[]];
					baseColumn: never;
				},
				{},
				{}
			>;
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
		id: 'PgSerial',
		name: 'PgText',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('sq');
});

test('Gets the columns from a View with sql', () => {
	const view = pgView('usersView').as((qb) =>
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
			id: PgColumn<
				{
					name: 'id';
					tableName: 'usersView';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			name: PgColumn<
				{
					name: 'name';
					tableName: 'usersView';
					dataType: 'string';
					columnType: 'PgText';
					data: string;
					driverParam: string;
					notNull: true;
					hasDefault: false;
					enumValues: [string, ...string[]];
					baseColumn: never;
				},
				{},
				{}
			>;
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
		id: 'PgSerial',
		name: 'PgText',
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
			id: PgColumn<
				{
					name: 'id';
					tableName: 'CTE';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
				},
				{},
				{}
			>;
			name: PgColumn<
				{
					name: 'name';
					tableName: 'CTE';
					dataType: 'string';
					columnType: 'PgText';
					data: string;
					driverParam: string;
					notNull: true;
					hasDefault: false;
					enumValues: [string, ...string[]];
					baseColumn: never;
				},
				{},
				{}
			>;
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
		id: 'PgSerial',
		name: 'PgText',
	});

	const tableName = columns.id.table[TableName];

	expect(tableName).toBe('CTE');
});
