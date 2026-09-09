import { Client } from '@planetscale/database';
import { sql } from 'drizzle-orm';
import { binary, mysqlTable, varbinary } from 'drizzle-orm/mysql-core';
import type { PlanetScaleDatabase } from 'drizzle-orm/planetscale-serverless';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import { beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { tests } from './mysql-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './mysql-common-cache';

const ENABLE_LOGGING = false;

let db: PlanetScaleDatabase;
let dbGlobalCached: PlanetScaleDatabase;
let cachedDb: PlanetScaleDatabase;

beforeAll(async () => {
	const client = new Client({ url: process.env['PLANETSCALE_CONNECTION_STRING']! });
	db = drizzle(client, { logger: ENABLE_LOGGING });
	cachedDb = drizzle(client, { logger: ENABLE_LOGGING, cache: new TestCache() });
	dbGlobalCached = drizzle(client, { logger: ENABLE_LOGGING, cache: new TestGlobalCache() });
});

beforeEach((ctx) => {
	ctx.mysql = {
		db,
	};
	ctx.cachedMySQL = {
		db: cachedDb,
		dbGlobalCached,
	};
});

skipTests([
	'mySchema :: view',
	'mySchema :: select from tables with same name from different schema using alias',
	'mySchema :: prepared statement with placeholder in .where',
	'mySchema :: insert with spaces',
	'mySchema :: select with group by as column + sql',
	'mySchema :: select with group by as field',
	'mySchema :: insert many',
	'mySchema :: insert with overridden default values',
	'mySchema :: insert + select',
	'mySchema :: delete with returning all fields',
	'mySchema :: update with returning partial',
	'mySchema :: delete returning sql',
	'mySchema :: insert returning sql',
	'mySchema :: select typed sql',
	'mySchema :: select sql',
	'mySchema :: select all fields',
	'test $onUpdateFn and $onUpdate works updating',
	'test $onUpdateFn and $onUpdate works as $default',
	'set operations (mixed all) as function with subquery',
	'set operations (mixed) from query builder',
	'set operations (except all) as function',
	'set operations (except all) from query builder',
	'set operations (except) as function',
	'set operations (except) from query builder',
	'set operations (intersect all) as function',
	'set operations (intersect all) from query builder',
	'set operations (intersect) as function',
	'set operations (intersect) from query builder',
	'select iterator w/ prepared statement',
	'select iterator',
	'subquery with view',
	'join on aliased sql from with clause',
	'with ... delete',
	'with ... update',
	'with ... select',

	// to redefine in this file
	'utc config for datetime',
	'transaction',
	'transaction with options (set isolationLevel)',
	'having',
	'select count()',
	'insert via db.execute w/ query builder',
	'insert via db.execute + select via db.execute',
	'insert many with returning',
	'delete with returning partial',
	'delete with returning all fields',
	'update with returning partial',
	'update with returning all fields',
	'update returning sql',
	'delete returning sql',
	'insert returning sql',
]);

test('binary and varbinary preserve non-UTF-8 bytes', async () => {
	const table = mysqlTable('binary_buffer_planetscale', {
		binary: binary('binary', { length: 4 }).notNull(),
		varbinary: varbinary('varbinary', { length: 4 }).notNull(),
	});
	const value = Buffer.from([0x00, 0xff, 0x80, 0x31]);

	await db.execute(sql`drop table if exists ${table}`);
	await db.execute(sql`create table ${table} (\`binary\` binary(4) not null, \`varbinary\` varbinary(4) not null)`);
	await db.insert(table).values({ binary: value, varbinary: value });

	const [row] = await db.select().from(table);

	expect(Buffer.isBuffer(row!.binary)).toBe(true);
	expect(Buffer.isBuffer(row!.varbinary)).toBe(true);
	expect(row!.binary).toEqual(value);
	expect(row!.varbinary).toEqual(value);

	await db.execute(sql`drop table ${table}`);
});

tests('planetscale');
cacheTests();
