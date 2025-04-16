import { Client } from '@planetscale/database';
import type { PlanetScaleDatabase } from 'drizzle-orm/planetscale-serverless';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import { beforeAll, beforeEach } from 'vitest';
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

tests('planetscale');
cacheTests();
