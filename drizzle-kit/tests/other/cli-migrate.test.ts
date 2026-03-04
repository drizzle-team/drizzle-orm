import { test as brotest } from '@drizzle-team/brocli';
import { assert, expect, test } from 'vitest';
import { migrate } from '../../src/cli/schema';

// good:
// #1 drizzle-kit generate
// #2 drizzle-kit generate --config=turso.config.ts
// #3 drizzle-kit generate --config=d1http.config.ts
// #4 drizzle-kit generate --config=postgres.config.ts ## spread connection params
// #5 drizzle-kit generate --config=drizzle2.config.ts ## custom schema and table for migrations journal

// errors:
// #1 drizzle-kit generate --config=expo.config.ts
// TODO: missing required params in config?

test('migrate #1', async (t) => {
	const res = await brotest(migrate, '');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'drizzle',
		credentials: {
			url: 'postgresql://postgres:postgres@127.0.0.1:5432/db',
		},
		schema: 'drizzle', // drizzle migrations table schema
		table: '__drizzle_migrations', // drizzle migrations table name
	});
});

test('migrate #2', async (t) => {
	const res = await brotest(migrate, '--config=turso.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'turso',
		out: 'drizzle',
		credentials: {
			authToken: 'token',
			url: 'turso.dev',
		},
		schema: 'drizzle', // drizzle migrations table schema
		table: '__drizzle_migrations', // drizzle migrations table name
	});
});

test('migrate #3', async (t) => {
	const res = await brotest(migrate, '--config=d1http.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		out: 'drizzle',
		credentials: {
			driver: 'd1-http',
			accountId: 'accid',
			databaseId: 'dbid',
			token: 'token',
		},
		schema: 'drizzle', // drizzle migrations table schema
		table: '__drizzle_migrations', // drizzle migrations table name
	});
});

test('migrate #4', async (t) => {
	const res = await brotest(migrate, '--config=postgres.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'drizzle',
		credentials: {
			database: 'db',
			host: '127.0.0.1',
			password: 'postgres',
			port: 5432,
			user: 'postgresql',
		},
		schema: 'drizzle', // drizzle migrations table schema
		table: '__drizzle_migrations', // drizzle migrations table name
	});
});

// catched a bug
test('migrate #5', async (t) => {
	const res = await brotest(migrate, '--config=postgres2.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'drizzle',
		credentials: {
			database: 'db',
			host: '127.0.0.1',
			password: 'postgres',
			port: 5432,
			user: 'postgresql',
		},
		schema: 'custom', // drizzle migrations table schema
		table: 'custom', // drizzle migrations table name
	});
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(migrate, '--config=expo.config.ts');
	assert.equal(res.type, 'error');
});
