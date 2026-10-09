import { test as brotest } from '@drizzle-team/brocli';
import type { PGlite } from '@electric-sql/pglite';
import { unlinkSync } from 'node:fs';
import { afterEach, assert, expect, expectTypeOf, test } from 'vitest';
import { defineConfig, type DialectCredentials, type DialectDriverMap } from '../../src';
import { CheckConfig } from '../../src/cli/commands/utils';
import { check } from '../../src/cli/schema';
import { type Driver, wrapParam } from '../../src/cli/validations/common';
import { error } from '../../src/cli/views';
import type { Dialect } from '../../src/utils/schemaValidator';
import { createConfig } from './utils';

const originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
process.env.TEST_CONFIG_PATH_PREFIX = './tests/cli/';
afterEach(() => {
	process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix ?? './tests/cli/';
});

// should point to test/cli
const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';
test('validate config #1', async (t) => {
	const { path, name } = createConfig({ dialect: 'postgresql' }, prefix);

	const res = await brotest(check, `--config=${name} --ignore-conflicts=false`);

	unlinkSync(path);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: CheckConfig & { output: 'text' | 'json' } = {
		dialect: 'postgresql',
		out: 'drizzle',
		ignoreConflicts: false,
		output: 'text',
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #2', async (t) => {
	const res = await brotest(check, `--dialect=postgresql --out=test --ignore-conflicts=true`);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: CheckConfig & { output: 'text' | 'json' } = {
		dialect: 'postgresql',
		out: 'test',
		ignoreConflicts: true,
		output: 'text',
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #3', async (t) => {
	const { path, name } = createConfig({ dialect: 'postgresql', out: 'test' }, prefix);

	const res = await brotest(check, `--config=${name}`);

	unlinkSync(path);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: CheckConfig & { output: 'text' | 'json' } = {
		dialect: 'postgresql',
		out: 'test',
		ignoreConflicts: undefined,
		output: 'text',
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #4', async (t) => {
	const { path, name } = createConfig(
		// @ts-expect-error
		{ out: 'test' },
		prefix,
	);

	const res = await brotest(check, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');
	if (res.type !== 'error') return;
	expect((res.error as Error).message).toBe(
		[error('Please provide required params:'), wrapParam('dialect', undefined)].join('\n'),
	);
});

test('validate config #5', async (t) => {
	const res = await brotest(check, `--out=test`);

	expect(res.type).toBe('error');
	if (res.type !== 'error') return;
	expect((res.error as Error).message).toBe(
		[error('Please provide required params:'), wrapParam('dialect', undefined)].join('\n'),
	);
});

type CheckConfigWithOutput = CheckConfig & { output: 'text' | 'json' };

test.each(['json', 'text'] as const)('output option parses %s mode', async (mode) => {
	const res = await brotest(check, `--dialect=postgresql --out=test --output=${mode}`);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: CheckConfigWithOutput = {
		dialect: 'postgresql',
		out: 'test',
		ignoreConflicts: undefined,
		output: mode,
	};
	expect(res.options).toStrictEqual(expected);
});

test('output defaults to text when omitted', async (t) => {
	const res = await brotest(check, `--dialect=postgresql --out=test`);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: CheckConfigWithOutput = {
		dialect: 'postgresql',
		out: 'test',
		ignoreConflicts: undefined,
		output: 'text',
	};
	expect(res.options).toStrictEqual(expected);
});

test('output option rejects an invalid value', async (t) => {
	const res = await brotest(check, `--dialect=postgresql --out=test --output=bogus`);

	expect(res.type).not.toBe('handler');
});

test('config types: credentials are optional', () => {
	defineConfig({ dialect: 'postgresql', schema: 'schema.ts', out: 'drizzle' });
	defineConfig({ dialect: 'postgresql', driver: 'pglite' });
	defineConfig({ dialect: 'postgresql', driver: 'aws-data-api', out: 'drizzle' });
	defineConfig({ dialect: 'sqlite', driver: 'd1-http', schema: 'schema.ts' });
	defineConfig({ dialect: 'mysql', schema: 'schema.ts' });
});

test('config types: every credentials variant is accepted', () => {
	const client = {} as PGlite;

	defineConfig({ dialect: 'postgresql', dbCredentials: { url: 'postgresql://localhost/db' } });
	defineConfig({
		dialect: 'postgresql',
		dbCredentials: { host: 'localhost', database: 'db', ssl: { rejectUnauthorized: false, ca: [Buffer.from('')] } },
	});
	defineConfig({
		dialect: 'postgresql',
		driver: 'aws-data-api',
		dbCredentials: { database: 'db', secretArn: 'secret', resourceArn: 'resource' },
	});
	defineConfig({ dialect: 'postgresql', driver: 'pglite', dbCredentials: { url: './pglite' } });
	defineConfig({ dialect: 'postgresql', driver: 'pglite', client });
	defineConfig({ dialect: 'mysql', dbCredentials: { host: 'localhost', database: 'db', ssl: { ca: 'ca' } } });
	defineConfig({ dialect: 'sqlite', dbCredentials: { url: 'sqlite.db' } });
	defineConfig({
		dialect: 'sqlite',
		driver: 'd1-http',
		dbCredentials: { accountId: 'account', databaseId: 'db', token: 'token' },
	});
	defineConfig({ dialect: 'turso', dbCredentials: { url: 'libsql://localhost', authToken: 'token' } });
	defineConfig({
		dialect: 'mssql',
		dbCredentials: { server: 'localhost', port: 1433, user: 'sa', password: 'password', database: 'db' },
	});
	defineConfig({ dialect: 'cockroach', dbCredentials: { host: 'localhost', database: 'db', ssl: 'require' } });
});

test('config types: credentials variants can not be mixed', () => {
	const client = {} as PGlite;

	// @ts-expect-error
	defineConfig({ dialect: 'postgresql', dbCredentials: { url: 'postgresql://localhost/db', host: 'localhost' } });
	defineConfig({
		dialect: 'postgresql',
		// @ts-expect-error
		dbCredentials: { url: 'postgresql://localhost/db', host: 'localhost', database: 'db' },
	});
	defineConfig({
		dialect: 'mysql',
		// @ts-expect-error
		dbCredentials: { url: 'mysql://localhost/db', host: 'localhost', database: 'db' },
	});
	defineConfig({
		dialect: 'singlestore',
		// @ts-expect-error
		dbCredentials: { url: 'mysql://localhost/db', host: 'localhost', database: 'db' },
	});
	defineConfig({
		dialect: 'cockroach',
		// @ts-expect-error
		dbCredentials: { url: 'postgresql://localhost/db', host: 'localhost', database: 'db' },
	});
	// @ts-expect-error
	defineConfig({ dialect: 'mssql', dbCredentials: { url: 'mssql://localhost/db', server: 'localhost' } });
	// @ts-expect-error
	defineConfig({ dialect: 'postgresql', driver: 'pglite', client, dbCredentials: { url: './pglite' } });
});

test('config types: credentials must match dialect and driver', () => {
	const client = {} as PGlite;

	// @ts-expect-error
	defineConfig({ dialect: 'postgresql', client });
	// @ts-expect-error
	defineConfig({ dialect: 'mysql', driver: 'pglite' });
	// @ts-expect-error
	defineConfig({ dialect: 'sqlite', driver: 'd1-http', dbCredentials: { url: 'sqlite.db' } });
	// @ts-expect-error
	defineConfig({ dialect: 'sqlite', dbCredentials: { url: 'sqlite.db', authToken: 'token' } });
	// @ts-expect-error
	defineConfig({ dialect: 'postgresql', dbCredentials: 5 });
});

test('config types: credentials are defined for every dialect and driver', () => {
	expectTypeOf<keyof DialectCredentials>().toEqualTypeOf<Dialect>();
	expectTypeOf<{ [D in Dialect]: keyof DialectCredentials[D] }>().toEqualTypeOf<
		{ [D in Dialect]: DialectDriverMap[D] }
	>();
	expectTypeOf<Exclude<DialectDriverMap[Dialect], 'default'>>().toEqualTypeOf<Driver>();
});
