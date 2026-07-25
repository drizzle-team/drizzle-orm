import { describe, it } from 'vitest';
import { GelDialect } from '~/gel-core/dialect.ts';
import { customType as gelCustomType, gelTable } from '~/gel-core/index.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import { customType as mysqlCustomType, mysqlTable } from '~/mysql-core/index.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { customType as pgCustomType, pgTable } from '~/pg-core/index.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import { customType as singlestoreCustomType, singlestoreTable } from '~/singlestore-core/index.ts';
import { sql } from '~/sql/index.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { customType as sqliteCustomType, sqliteTable } from '~/sqlite-core/index.ts';

const pgLowerText = pgCustomType<{ data: string; driverData: string }>({
	dataType: () => 'text',
	fromDriver: (value) => value,
	selectFromDb: (column) => sql`lower(${column})`,
});

const mysqlLowerText = mysqlCustomType<{ data: string; driverData: string }>({
	dataType: () => 'text',
	fromDriver: (value) => value,
	selectFromDb: (column) => sql`lower(${column})`,
});

const sqliteLowerText = sqliteCustomType<{ data: string; driverData: string }>({
	dataType: () => 'text',
	fromDriver: (value) => value,
	selectFromDb: (column) => sql`lower(${column})`,
});

const gelLowerText = gelCustomType<{ data: string; driverData: string }>({
	dataType: () => 'str',
	fromDriver: (value) => value,
	selectFromDb: (column) => sql`str_lower(${column})`,
});

const singlestoreLowerText = singlestoreCustomType<{ data: string; driverData: string }>({
	dataType: () => 'text',
	fromDriver: (value) => value,
	selectFromDb: (column) => sql`lower(${column})`,
});

const pgUsers = pgTable('users', {
	lowerName: pgLowerText('lower_name'),
});

const mysqlUsers = mysqlTable('users', {
	lowerName: mysqlLowerText('lower_name'),
});

const sqliteUsers = sqliteTable('users', {
	lowerName: sqliteLowerText('lower_name'),
});

const gelUsers = gelTable('users', {
	lowerName: gelLowerText('lower_name'),
});

const singlestoreUsers = singlestoreTable('users', {
	lowerName: singlestoreLowerText('lower_name'),
});

describe('custom type selectFromDb', () => {
	it('wraps selected PostgreSQL custom columns', ({ expect }) => {
		const dialect = new PgDialect();
		const query = dialect.buildSelectQuery({
			fields: {},
			fieldsFlat: [{ path: ['lowerName'], field: pgUsers.lowerName }],
			table: pgUsers,
			setOperators: [],
		});

		expect(dialect.sqlToQuery(query)).toEqual({
			sql: 'select lower("lower_name") as "lower_name" from "users"',
			params: [],
		});
	});

	it('wraps selected MySQL custom columns', ({ expect }) => {
		const dialect = new MySqlDialect();
		const query = dialect.buildSelectQuery({
			fields: {},
			fieldsFlat: [{ path: ['lowerName'], field: mysqlUsers.lowerName }],
			table: mysqlUsers,
			setOperators: [],
		});

		expect(dialect.sqlToQuery(query)).toEqual({
			sql: 'select lower(`lower_name`) as `lower_name` from `users`',
			params: [],
		});
	});

	it('wraps selected SQLite custom columns', ({ expect }) => {
		const dialect = new SQLiteSyncDialect();
		const query = dialect.buildSelectQuery({
			fields: {},
			fieldsFlat: [{ path: ['lowerName'], field: sqliteUsers.lowerName }],
			table: sqliteUsers,
			setOperators: [],
		});

		expect(dialect.sqlToQuery(query)).toEqual({
			sql: 'select lower("lower_name") as "lower_name" from "users"',
			params: [],
		});
	});

	it('wraps selected Gel custom columns', ({ expect }) => {
		const dialect = new GelDialect();
		const query = dialect.buildSelectQuery({
			fields: {},
			fieldsFlat: [{ path: ['lowerName'], field: gelUsers.lowerName }],
			table: gelUsers,
			setOperators: [],
		});

		expect(dialect.sqlToQuery(query)).toEqual({
			sql: 'select str_lower("users"."lower_name") as "lower_name" from "users"',
			params: [],
		});
	});

	it('wraps selected SingleStore custom columns', ({ expect }) => {
		const dialect = new SingleStoreDialect();
		const query = dialect.buildSelectQuery({
			fields: {},
			fieldsFlat: [{ path: ['lowerName'], field: singlestoreUsers.lowerName }],
			table: singlestoreUsers,
			setOperators: [],
		});

		expect(dialect.sqlToQuery(query)).toEqual({
			sql: 'select lower(`lower_name`) as `lower_name` from `users`',
			params: [],
		});
	});
});
