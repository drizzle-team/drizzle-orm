import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { assert, expect, test, vi } from 'vitest';
import { pull } from '../../src/cli/schema';
import { createConfig } from './utils';

test('pull #1', async (t) => {
	const res = await brotest(pull, '');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'drizzle',
		breakpoints: true,
		casing: 'camel',
		credentials: {
			url: 'postgresql://postgres:postgres@127.0.0.1:5432/db',
		},
		filters: {
			entities: undefined,
			extensions: undefined,
			schemas: undefined,
			tables: undefined,
		},
		init: false,
		migrations: {
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	});
});

test('pull #2', async (t) => {
	const res = await brotest(pull, '--config=turso.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'turso',
		out: 'drizzle',
		breakpoints: true,
		casing: 'camel',
		credentials: {
			authToken: 'token',
			url: 'turso.dev',
		},
		filters: {
			entities: undefined,
			extensions: undefined,
			schemas: undefined,
			tables: undefined,
		},
		init: false,
		migrations: {
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	});
});

test('pull #3', async (t) => {
	const res = await brotest(pull, '--config=d1http.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		out: 'drizzle',
		breakpoints: true,
		casing: 'camel',
		credentials: {
			driver: 'd1-http',
			accountId: 'accid',
			databaseId: 'dbid',
			token: 'token',
		},
		filters: {
			entities: undefined,
			extensions: undefined,
			schemas: undefined,
			tables: undefined,
		},
		init: false,
		migrations: {
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	});
});

test('pull #4', async (t) => {
	const res = await brotest(pull, '--config=postgres.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'drizzle',
		breakpoints: true,
		casing: 'camel',
		credentials: {
			database: 'db',
			host: '127.0.0.1',
			password: 'postgres',
			port: 5432,
			user: 'postgresql',
		},
		filters: {
			entities: undefined,
			extensions: undefined,
			schemas: undefined,
			tables: undefined,
		},
		init: false,
		migrations: {
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	});
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(pull, '--config=expo.config.ts');
	assert.equal(res.type, 'error');
});

// should point to test/cli
const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';
test('validate config #1', async (t) => {
	const { path, name } = createConfig({
		dialect: 'postgresql',
		schema: 'schema.ts',
		dbCredentials: { url: 'test_url' },
		introspect: { casing: 'preserve' },
		strict: true,
		schemaFilter: ['public'],
		breakpoints: false,
		driver: 'pglite',
		entities: {
			roles: true,
		},
		extensionsFilters: ['postgis'],
		migrations: {
			schema: 'new_schema',
		},
		tablesFilter: ['test'],
		out: 'drizzle2',
		verbose: false,
	}, prefix);

	const res = await brotest(pull, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'postgresql',
		out: 'drizzle2',
		breakpoints: false,
		casing: 'preserve',
		credentials: {
			driver: 'pglite',
			url: 'test_url',
		},
		filters: {
			entities: {
				roles: true,
			},
			extensions: [
				'postgis',
			],
			schemas: [
				'public',
			],
			tables: [
				'test',
			],
		},
		init: false,
		migrations: {
			schema: 'new_schema',
			table: '__drizzle_migrations',
		},
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #2', async (t) => {
	const { path, name } = createConfig({
		dialect: 'mssql',
		schema: 'schema.ts',
		dbCredentials: { database: 'db', server: 'host', password: 'SA', port: 123, user: 'SA' },
		introspect: { casing: 'preserve' },
		strict: true,
		// schemaFilter: ['public'],
		// extensionsFilters: ["postgis"],
		breakpoints: false,
		// driver: 'pglite',
		entities: {
			roles: {
				exclude: ['admin'],
			},
		},
		migrations: {
			schema: 'new_schema',
		},
		tablesFilter: ['test'],
		out: 'drizzle2',
		verbose: false,
	}, prefix);

	const res = await brotest(pull, `--config=${name} --init=true`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'mssql',
		out: 'drizzle2',
		breakpoints: false,
		casing: 'preserve',
		credentials: {
			database: 'db',
			password: 'SA',
			port: 123,
			server: 'host',
			user: 'SA',
		},
		filters: {
			entities: {
				roles: {
					exclude: ['admin'],
				},
			},
			extensions: undefined,
			schemas: undefined,
			tables: [
				'test',
			],
		},
		init: true,
		migrations: {
			schema: 'new_schema',
			table: '__drizzle_migrations',
		},
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #3', async (t) => {
	const { path, name } = createConfig({
		dialect: 'sqlite',
		schema: 'schema.ts',
		dbCredentials: { accountId: '1', databaseId: '2', token: '3' },
		introspect: { casing: 'preserve' },
		strict: true,
		schemaFilter: ['public'],
		breakpoints: false,
		entities: {
			roles: {
				include: ['admin'],
			},
		},
		extensionsFilters: ['postgis'],
		tablesFilter: 'test',
		migrations: {
			table: 'test_table',
		},
		driver: 'd1-http',
		out: 'out2',
	}, prefix);

	const res = await brotest(pull, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'sqlite',
		out: 'out2',
		breakpoints: false,
		casing: 'preserve',
		credentials: {
			driver: 'd1-http',
			accountId: '1',
			databaseId: '2',
			token: '3',
		},
		filters: {
			entities: {
				roles: {
					include: ['admin'],
				},
			},
			extensions: ['postgis'],
			schemas: ['public'],
			tables: 'test',
		},
		init: false,
		migrations: {
			schema: 'drizzle',
			table: 'test_table',
		},
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #4', async (t) => {
	const { path, name } = createConfig({
		dialect: 'mysql',
		dbCredentials: {
			url: 'url',
		},
	}, prefix);

	const res = await brotest(pull, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'mysql',
		out: 'drizzle',
		breakpoints: true,
		casing: 'camel',
		credentials: {
			url: 'url',
		},
		filters: {
			entities: undefined,
			extensions: undefined,
			schemas: undefined,
			tables: undefined,
		},
		init: false,
		migrations: {
			schema: 'drizzle',
			table: '__drizzle_migrations',
		},
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #5', async (t) => {
	const spy = vi.spyOn(console, 'log');

	// @ts-expect-error
	const { path, name } = createConfig({
		// dialect: 'mysql',
		dbCredentials: {
			url: 'url',
		},
	}, prefix);

	const res = await brotest(pull, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');

	expect(spy).toHaveBeenNthCalledWith(1, `Reading config file '${path}'`);
	expect(spy).toHaveBeenNthCalledWith(
		2,
		`Error  Please provide required params:
    [x] dialect: undefined`,
	);

	let error: any = res.type === 'error' ? res.error : undefined;
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe('process.exit unexpectedly called with "1"');

	spy.mockRestore();
});

test('validate config #6', async (t) => {
	const spy = vi.spyOn(console, 'log');

	const { path, name } = createConfig({
		dialect: 'mysql',
		dbCredentials: {
			url: '',
		},
	}, prefix);

	const res = await brotest(pull, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');

	expect(spy).toHaveBeenNthCalledWith(1, `Reading config file '${path}'`);
	expect(spy).toHaveBeenNthCalledWith(
		2,
		'Error  Please provide required params for MySQL driver:',
	);

	let error: any = res.type === 'error' ? res.error : undefined;
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe('process.exit unexpectedly called with "1"');

	spy.mockRestore();
});
