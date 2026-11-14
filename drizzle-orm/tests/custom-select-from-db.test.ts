import { Client } from '@planetscale/database';
import Database from 'better-sqlite3';
import postgres from 'postgres';
import { describe, it } from 'vitest';
import { drizzle as sqliteDrizzle } from '~/better-sqlite3';
import { customType as mysqlCustomType, mysqlTable } from '~/mysql-core';
import { customType as pgCustomType, pgTable } from '~/pg-core';
import { drizzle as planetscale } from '~/planetscale-serverless';
import { drizzle as pgDrizzle } from '~/postgres-js';
import { sql } from '~/sql';
import { customType as sqliteCustomType, sqliteTable } from '~/sqlite-core';

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

const pgUsers = pgTable('users', {
	lowerName: pgLowerText('lower_name'),
});

const mysqlUsers = mysqlTable('users', {
	lowerName: mysqlLowerText('lower_name'),
});

const sqliteUsers = sqliteTable('users', {
	lowerName: sqliteLowerText('lower_name'),
});

describe('custom type selectFromDb', () => {
	it('wraps selected PostgreSQL custom columns', ({ expect }) => {
		const db = pgDrizzle(postgres(''));
		const query = db.select({ lowerName: pgUsers.lowerName }).from(pgUsers);

		expect(query.toSQL()).toEqual({
			sql: 'select lower("lower_name") as "lower_name" from "users"',
			params: [],
		});
	});

	it('wraps selected MySQL custom columns', ({ expect }) => {
		const db = planetscale(new Client({}));
		const query = db.select({ lowerName: mysqlUsers.lowerName }).from(mysqlUsers);

		expect(query.toSQL()).toEqual({
			sql: 'select lower(`lower_name`) as `lower_name` from `users`',
			params: [],
		});
	});

	it('wraps selected SQLite custom columns', ({ expect }) => {
		const db = sqliteDrizzle(new Database(':memory:'));
		const query = db.select({ lowerName: sqliteUsers.lowerName }).from(sqliteUsers);

		expect(query.toSQL()).toEqual({
			sql: 'select lower("lower_name") as "lower_name" from "users"',
			params: [],
		});
	});
});
