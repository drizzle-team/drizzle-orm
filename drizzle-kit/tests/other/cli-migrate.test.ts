import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'fs';
import { assert, expect, test, vi } from 'vitest';
import { migrate } from '../../src/cli/schema';
import { createConfig } from './utils';

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
	}, prefix);

	const res = await brotest(migrate, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'postgresql',
		out: 'drizzle',
		credentials: {
			url: 'test_url',
		},
		schema: 'drizzle',
		table: '__drizzle_migrations',
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #2', async (t) => {
	const { path, name } = createConfig({
		dialect: 'mssql',
		schema: 'schema.ts',
		dbCredentials: { url: 'test_url' },
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
	}, prefix);

	const res = await brotest(migrate, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'mssql',
		out: 'drizzle',
		credentials: {
			url: 'test_url',
		},
		schema: 'drizzle',
		table: 'test_table',
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #3', async (t) => {
	const { path, name } = createConfig({
		dialect: 'mysql',
		// schema: 'schema.ts',
		dbCredentials: { url: 'test_url' },
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
	}, prefix);

	const res = await brotest(migrate, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected = {
		dialect: 'mysql',
		out: 'drizzle',
		credentials: {
			url: 'test_url',
		},
		schema: 'drizzle',
		table: 'test_table',
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #3', async (t) => {
	const spy = vi.spyOn(console, 'log');

	const { path, name } = createConfig(
		// @ts-expect-error
		{ driver: 'aws-data-api', out: 'test' },
		prefix,
	);

	const res = await brotest(migrate, `--config=${name}`);

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
