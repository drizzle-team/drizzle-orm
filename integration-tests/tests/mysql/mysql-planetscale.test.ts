import { Client } from '@planetscale/database';
import type { PlanetScaleDatabase } from 'drizzle-orm/planetscale-serverless';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import { beforeAll, beforeEach } from 'vitest';
import { skipTests } from '~/common';
import { tests } from './mysql-common';

const ENABLE_LOGGING = false;

let db: PlanetScaleDatabase;

beforeAll(async () => {
	db = drizzle(new Client({ url: process.env['PLANETSCALE_CONNECTION_STRING']! }), { logger: ENABLE_LOGGING });
});

beforeEach((ctx) => {
	ctx.mysql = {
		db,
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
]);

tests('planetscale');
