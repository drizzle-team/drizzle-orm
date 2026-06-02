import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { assert, expect, test, vi } from 'vitest';
import { push } from '../../src/cli/schema';
import { createConfig } from './utils';

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
	});
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(push, '--config=expo.config.ts');
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

	const res = await brotest(push, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'postgresql',
		explain: false,
		verbose: false,
		force: false,
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
		migrations: {
			schema: 'new_schema',
			table: '__drizzle_migrations',
		},
		filenames: [filename],
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #2', async (t) => {
	const { path, name } = createConfig({
		dialect: 'postgresql',
		schema: 'schema.ts',
		dbCredentials: { database: 'db', host: 'host' },
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

	const res = await brotest(push, `--config=${name} --explain=true`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'postgresql',
		explain: true,
		verbose: false,
		force: false,
		credentials: {
			database: 'db',
			host: 'host',
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
		migrations: {
			schema: 'new_schema',
			table: '__drizzle_migrations',
		},
		filenames: [filename],
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
			roles: true,
		},
		extensionsFilters: ['postgis'],
		tablesFilter: 'test',
		migrations: {
			table: 'test_table',
		},
		driver: 'd1-http',
		out: 'out2',
	}, prefix);

	const res = await brotest(push, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'sqlite',
		explain: false,
		verbose: false,
		force: false,
		credentials: {
			driver: 'd1-http',
			accountId: '1',
			databaseId: '2',
			token: '3',
		},
		filters: {
			entities: {
				roles: true,
			},
			extensions: ['postgis'],
			schemas: ['public'],
			tables: 'test',
		},
		migrations: {
			schema: 'drizzle',
			table: 'test_table',
		},
		filenames: [filename],
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #4', async (t) => {
	const { path, name } = createConfig({
		dialect: 'mysql',
		schema: 'schema.ts',
		dbCredentials: {
			url: 'url',
		},
	}, prefix);

	const res = await brotest(push, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'mysql',
		explain: false,
		verbose: false,
		force: false,
		credentials: {
			url: 'url',
		},
		filters: {
			entities: undefined,
			extensions: undefined,
			schemas: undefined,
			tables: undefined,
		},
		migrations: {
			schema: 'drizzle',
			table: '__drizzle_migrations',
		},
		filenames: [filename],
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #5', async (t) => {
	const spy = vi.spyOn(console, 'log');

	const { path, name } = createConfig({
		dialect: 'mysql',
		// schema: 'schema.ts',
		dbCredentials: {
			url: 'url',
		},
	}, prefix);

	const res = await brotest(push, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');

	expect(spy).toHaveBeenNthCalledWith(1, `Reading config file '${path}'`);
	expect(spy).toHaveBeenNthCalledWith(
		2,
		`Error  Please provide required params:
    [✓] dialect: 'mysql'
    [x] schema: undefined`,
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

	const res = await brotest(push, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');

	expect(spy).toHaveBeenNthCalledWith(1, `Reading config file '${path}'`);
	expect(spy).toHaveBeenNthCalledWith(
		2,
		`Reading schema files:\n${join(process.cwd(), prefix, 'schema.ts')}\n`,
	);
	expect(spy).toHaveBeenNthCalledWith(
		3,
		'Error  Either connection "url" or "host", "database" are required for PostgreSQL database connection',
	);

	let error: any = res.type === 'error' ? res.error : undefined;
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe('process.exit unexpectedly called with "1"');

	spy.mockRestore();
});
