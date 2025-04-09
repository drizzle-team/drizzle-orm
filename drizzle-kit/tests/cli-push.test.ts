import { test as brotest } from '@drizzle-team/brocli';
import { assert, expect, test } from 'vitest';
import { push } from '../src/cli/schema';

// good:
// #1 drizzle-kit push
// #2 drizzle-kit push --config=turso.config.ts
// #3 drizzle-kit push --config=d1http.config.ts
// #4 drizzle-kit push --config=postgres.config.ts ## spread connection params
// #5 drizzle-kit push --config=drizzle2.config.ts ## custom schema and table for migrations journal

// errors:
// #1 drizzle-kit push --config=expo.config.ts
// TODO: missing required params in config?

test('push #1', async (t) => {
	const res = await brotest(push, '');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		credentials: {
			url: 'postgresql://postgres:postgres@127.0.0.1:5432/db',
		},
		force: false,
		schemaPath: './schema.ts',
		schemasFilter: ['public'],
		tablesFilter: [],
		entities: undefined,
		strict: false,
		verbose: false,
		casing: undefined,
	});
});

test('push #2', async (t) => {
	const res = await brotest(push, '--config=turso.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'turso',
		credentials: {
			authToken: 'token',
			url: 'turso.dev',
		},
		force: false,
		schemaPath: './schema.ts',
		schemasFilter: ['public'],
		tablesFilter: [],
		strict: false,
		verbose: false,
		casing: undefined,
	});
});

test('push #3', async (t) => {
	const res = await brotest(push, '--config=d1http.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		credentials: {
			driver: 'd1-http',
			accountId: 'accid',
			databaseId: 'dbid',
			token: 'token',
		},
		force: false,
		schemaPath: './schema.ts',
		schemasFilter: ['public'],
		tablesFilter: [],
		strict: false,
		verbose: false,
		casing: undefined,
	});
});

test('push #4', async (t) => {
	const res = await brotest(push, '--config=postgres.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		credentials: {
			database: 'db',
			host: '127.0.0.1',
			password: 'postgres',
			port: 5432,
			user: 'postgresql',
		},
		force: false,
		schemaPath: './schema.ts',
		schemasFilter: ['public'],
		tablesFilter: [],
		entities: undefined,
		strict: false,
		verbose: false,
		casing: undefined,
	});
});

// catched a bug
test('push #5', async (t) => {
	const res = await brotest(push, '--config=postgres2.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		credentials: {
			database: 'db',
			host: '127.0.0.1',
			password: 'postgres',
			port: 5432,
			user: 'postgresql',
		},
		schemaPath: './schema.ts',
		schemasFilter: ['public'],
		tablesFilter: [],
		strict: false,
		entities: undefined,
		force: false,
		verbose: false,
		casing: undefined,
	});
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(push, '--config=expo.config.ts');
	assert.equal(res.type, 'error');
});
