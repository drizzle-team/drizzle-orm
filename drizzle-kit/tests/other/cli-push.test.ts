import { test as brotest } from '@drizzle-team/brocli';
import { lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, assert, expect, test } from 'vitest';
import { HintsHandler } from '../../src/cli/hints';
import { push } from '../../src/cli/schema';

const originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
process.env.TEST_CONFIG_PATH_PREFIX = './tests/cli/';

afterEach(() => {
	if (originalPrefix === undefined) {
		process.env.TEST_CONFIG_PATH_PREFIX = './tests/cli/';
	} else {
		process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
	}
});

// good:
// #1 drizzle-kit push
// #2 drizzle-kit push --config=turso.config.ts
// #3 drizzle-kit push --config=d1http.config.ts
// #4 drizzle-kit push --config=postgres.config.ts ## spread connection params
// #5 drizzle-kit push --config=drizzle2.config.ts ## custom schema and table for migrations journal

// errors:
// #1 drizzle-kit push --config=expo.config.ts
// TODO: missing required params in config?

const filename = join(process.cwd(), 'tests/cli/schema.ts');
test('push #1', async (t) => {
	const res = await brotest(push, '');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		credentials: {
			url: 'postgresql://postgres:postgres@127.0.0.1:5432/db',
		},
		force: false,
		filenames: [filename],
		explain: false,
		filters: {
			schemas: undefined,
			tables: undefined,
			entities: undefined,
			extensions: undefined,
		},
		verbose: false,

		migrations: {
			schema: 'drizzle',
			table: '__drizzle_migrations',
		},
		hints: expect.any(HintsHandler),
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
		filenames: [filename],
		explain: false,
		filters: {
			schemas: undefined,
			tables: undefined,
			entities: undefined,
			extensions: undefined,
		},
		verbose: false,

		migrations: {
			schema: 'drizzle',
			table: '__drizzle_migrations',
		},
		hints: expect.any(HintsHandler),
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
		filenames: [filename],
		explain: false,
		filters: {
			schemas: undefined,
			tables: undefined,
			entities: undefined,
			extensions: undefined,
		},
		verbose: false,

		migrations: {
			schema: 'drizzle',
			table: '__drizzle_migrations',
		},
		hints: expect.any(HintsHandler),
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
		explain: false,
		filters: {
			schemas: undefined,
			tables: undefined,
			entities: undefined,
			extensions: undefined,
		},
		filenames: [filename],
		verbose: false,

		migrations: {
			schema: 'drizzle',
			table: '__drizzle_migrations',
		},
		hints: expect.any(HintsHandler),
	});
});

// catched a bug
test('push #5', async (t) => {
	const res = await brotest(push, '--config=postgres2.config.ts');
	if (res.type !== 'handler') {
		assert.fail(res.type, 'handler');
	}

	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		credentials: {
			database: 'db',
			host: '127.0.0.1',
			password: 'postgres',
			port: 5432,
			user: 'postgresql',
		},
		filenames: [filename],
		explain: false,
		filters: {
			schemas: undefined,
			tables: undefined,
			entities: undefined,
			extensions: undefined,
		},
		force: false,
		verbose: false,

		migrations: {
			schema: 'custom',
			table: 'custom',
		},
		hints: expect.any(HintsHandler),
	});
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(push, '--config=expo.config.ts');
	assert.equal(res.type, 'error');
});
