import { expect, test } from 'vitest';

import { customType as mysqlCustomType, int, MySqlDialect, mysqlTable } from '~/mysql-core';
import { customType as pgCustomType, integer, PgDialect, pgTable } from '~/pg-core';
import { sql } from '~/sql';
import {
	customType as sqliteCustomType,
	integer as sqliteInteger,
	SQLiteSyncDialect,
	sqliteTable,
} from '~/sqlite-core';

test('custom pg types can wrap selected column SQL', () => {
	const lowerText = pgCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		selectFromDb: (column) => sql`lower(${column})`,
	});

	const users = pgTable('users', {
		id: integer('id'),
		name: lowerText('name'),
	});

	const dialect = new PgDialect();

	const singleTableQuery = dialect.sqlToQuery(dialect.buildSelectQuery({
		fields: { name: users.name },
		table: users,
		setOperators: [],
	}));

	expect(singleTableQuery.sql).toBe('select lower("name") as "name" from "users"');

	const pets = pgTable('pets', {
		ownerId: integer('owner_id'),
	});

	const joinQuery = dialect.sqlToQuery(dialect.buildSelectQuery({
		fields: { name: users.name },
		table: users,
		joins: [{
			on: sql`${users.id} = ${pets.ownerId}`,
			table: pets,
			alias: undefined,
			joinType: 'left',
		}],
		setOperators: [],
	}));

	expect(joinQuery.sql).toBe(
		'select lower("users"."name") as "name" from "users" left join "pets" on "users"."id" = "pets"."owner_id"',
	);
});

test('custom mysql types can wrap selected column SQL', () => {
	const lowerText = mysqlCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		selectFromDb: (column) => sql`lower(${column})`,
	});

	const users = mysqlTable('users', {
		id: int('id'),
		name: lowerText('name'),
	});

	const dialect = new MySqlDialect();
	const query = dialect.sqlToQuery(dialect.buildSelectQuery({
		fields: { name: users.name },
		table: users,
		setOperators: [],
	}));

	expect(query.sql).toBe('select lower(`name`) as `name` from `users`');
});

test('custom sqlite types can wrap selected column SQL', () => {
	const lowerText = sqliteCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		selectFromDb: (column) => sql`lower(${column})`,
	});

	const users = sqliteTable('users', {
		id: sqliteInteger('id'),
		name: lowerText('name'),
	});

	const dialect = new SQLiteSyncDialect();
	const query = dialect.sqlToQuery(dialect.buildSelectQuery({
		fields: { name: users.name },
		table: users,
		setOperators: [],
	}));

	expect(query.sql).toBe('select lower("name") as "name" from "users"');
});
