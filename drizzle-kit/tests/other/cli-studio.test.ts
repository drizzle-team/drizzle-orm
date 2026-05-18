import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'node:fs';
import { assert, expect, test, vi } from 'vitest';
import { studio } from '../../src/cli/schema';
import { createConfig } from './utils';

test('studio #1', async (t) => {
	const res = await brotest(studio, '');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		schema: './schema.ts',
		host: '127.0.0.1',
		port: 4983,
		credentials: {
			url: 'postgresql://postgres:postgres@127.0.0.1:5432/db',
		},
	});
});

test('studio #2', async (t) => {
	const res = await brotest(studio, '--config=turso.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'turso',
		schema: './schema.ts',
		host: '127.0.0.1',
		port: 4983,
		credentials: {
			authToken: 'token',
			url: 'turso.dev',
		},
	});
});

test('studio #3', async (t) => {
	const res = await brotest(studio, '--config=d1http.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		schema: './schema.ts',
		host: '127.0.0.1',
		port: 4983,
		credentials: {
			accountId: 'accid',
			databaseId: 'dbid',
			driver: 'd1-http',
			token: 'token',
		},
	});
});

test('studio #4', async (t) => {
	const res = await brotest(studio, '--config=postgres.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		schema: './schema.ts',
		host: '127.0.0.1',
		port: 4983,
		credentials: {
			host: '127.0.0.1',
			port: 5432,
			user: 'postgresql',
			password: 'postgres',
			database: 'db',
		},
	});
});

// catched a bug
test('studio #5', async (t) => {
	const res = await brotest(studio, '--config=postgres2.config.ts');
	if (res.type !== 'handler') {
		assert.fail(res.type, 'handler');
	}

	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		schema: './schema.ts',
		host: '127.0.0.1',
		port: 4983,
		credentials: {
			host: '127.0.0.1',
			port: 5432,
			user: 'postgresql',
			password: 'postgres',
			database: 'db',
		},
	});
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(studio, '--config=expo.config.ts');
	assert.equal(res.type, 'error');
});

const prefix = process.env.TEST_CONFIG_PATH_PREFIX!;
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

	const res = await brotest(studio, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'postgresql',
		schema: 'schema.ts',
		host: '127.0.0.1',
		port: 4983,
		credentials: {
			driver: 'pglite',
			url: 'test_url',
		},
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #2', async (t) => {
	const { path, name } = createConfig({
		dialect: 'postgresql',
		dbCredentials: {
			url: 'test',
		},
	}, prefix);

	const res = await brotest(studio, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		credentials: {
			url: 'test',
		},
		dialect: 'postgresql',
		host: '127.0.0.1',
		port: 4983,
		schema: undefined,
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #5', async (t) => {
	const spy = vi.spyOn(console, 'log');

	// @ts-expect-error
	const { path, name } = createConfig({
		// dialect: 'mysql',
		// schema: 'schema.ts',
		dbCredentials: {
			url: 'url',
		},
	}, prefix);

	const res = await brotest(studio, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');

	expect(spy).toHaveBeenNthCalledWith(1, `Reading config file '${path}'`);
	expect(spy).toHaveBeenNthCalledWith(
		2,
		` Invalid input  Please specify 'dialect' param in config, either of 'postgresql', 'mysql', 'sqlite', turso or singlestore`,
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
		dialect: 'postgresql',
		schema: 'schema.ts',
		// dbCredentials: {
		// 	url: 'url',
		// },
	}, prefix);

	const res = await brotest(studio, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');

	expect(spy).toHaveBeenNthCalledWith(1, `Reading config file '${path}'`);
	expect(spy).toHaveBeenNthCalledWith(
		2,
		` Invalid input  Please specify a 'dbCredentials' param in config. It will help drizzle to know how to query you database. You can read more about drizzle.config: https://orm.drizzle.team/kit-docs/config-reference`,
	);

	let error: any = res.type === 'error' ? res.error : undefined;
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe('process.exit unexpectedly called with "1"');

	spy.mockRestore();
});
