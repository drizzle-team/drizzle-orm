import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { GenerateConfig } from 'src/cli/commands/utils';
import { assert, expect, test, vi } from 'vitest';
import { generate } from '../../src/cli/schema';
import { createConfig } from './utils';

// good:
// #1 drizzle-kit generate --dialect=postgresql --schema=schema.ts
// #2 drizzle-kit generate --dialect=postgresql --schema=schema.ts --out=out
// #3 drizzle-kit generate
// #4 drizzle-kit generate --custom
// #5 drizzle-kit generate --name=custom
// #6 drizzle-kit generate
// #7 drizzle-kit generate --name=custom --custom
// #8 drizzle-kit generate --config=drizzle1.config.ts
// #9 drizzle-kit generate --dialect=postgresql --schema=schema.ts --out=out --name=custom --custom

// errors:
// #1 drizzle-kit generate --schema=src/schema.ts
// #2 drizzle-kit generate --dialect=postgresql
// #3 drizzle-kit generate --dialect=postgresql2
// #4 drizzle-kit generate --driver=expo
// #5 drizzle-kit generate --dialect=postgresql --out=out
// #6 drizzle-kit generate --config=drizzle.config.ts --out=out
// #7 drizzle-kit generate --config=drizzle.config.ts --schema=schema.ts
// #8 drizzle-kit generate --config=drizzle.config.ts --dialect=postgresql

const filename = join(process.cwd(), 'tests/cli/schema.ts');

test('generate #1', async (t) => {
	const res = await brotest(
		generate,
		'--dialect=postgresql --schema=schema.ts',
	);
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: undefined,
		custom: false,
		breakpoints: true,
		filenames: [filename],
		out: 'drizzle',
		bundle: false,

		driver: undefined,
		ignoreConflicts: false,
	});
});

test('generate #2', async (t) => {
	const res = await brotest(
		generate,
		'--dialect=postgresql --schema=schema.ts --out=out',
	);

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: undefined,
		custom: false,
		breakpoints: true,
		filenames: [filename],
		out: 'out',
		bundle: false,

		driver: undefined,
		ignoreConflicts: false,
	});
});

test('generate #3', async (t) => {
	const res = await brotest(generate, '');

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: undefined,
		custom: false,
		breakpoints: true,
		filenames: [filename],
		out: 'drizzle',
		bundle: false,

		driver: undefined,
		ignoreConflicts: false,
	});
});

// config | pass through custom
test('generate #4', async (t) => {
	const res = await brotest(generate, '--custom');

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: undefined,
		custom: true,
		breakpoints: true,
		filenames: [filename],
		out: 'drizzle',
		bundle: false,

		driver: undefined,
		ignoreConflicts: false,
	});
});

// config | pass through name
test('generate #5', async (t) => {
	const res = await brotest(generate, '--name=custom');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: 'custom',
		custom: false,
		breakpoints: true,
		filenames: [filename],
		out: 'drizzle',
		bundle: false,

		driver: undefined,
		ignoreConflicts: false,
	});
});

// config
test('generate #6', async (t) => {
	const res = await brotest(generate, '');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: undefined,
		custom: false,
		breakpoints: true,
		filenames: [filename],
		out: 'drizzle',
		bundle: false,

		driver: undefined,
		ignoreConflicts: false,
	});
});

// config | pass through name and custom
test('generate #7', async (t) => {
	const res = await brotest(generate, '--name=custom --custom');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: 'custom',
		custom: true,
		breakpoints: true,
		filenames: [filename],
		out: 'drizzle',
		bundle: false,

		driver: undefined,
		ignoreConflicts: false,
	});
});

// custom config path
test('generate #8', async (t) => {
	const res = await brotest(generate, '--config=expo.config.ts');
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		name: undefined,
		custom: false,
		breakpoints: true,
		filenames: [filename],
		out: 'drizzle',
		bundle: true, // expo driver

		driver: 'expo',
		ignoreConflicts: false,
	});
});

test('generate #9', async (t) => {
	const res = await brotest(generate, '--config=durable-sqlite.config.ts');
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		name: undefined,
		custom: false,
		breakpoints: true,
		filenames: [filename],
		out: 'drizzle',
		bundle: true, // expo driver

		driver: 'durable-sqlite',
		ignoreConflicts: false,
	});
});

// cli | pass through name and custom
test('generate #9', async (t) => {
	const res = await brotest(
		generate,
		'--dialect=postgresql --schema=schema.ts --out=out --name=custom --custom',
	);

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: 'custom',
		custom: true,
		breakpoints: true,
		filenames: [filename],
		out: 'out',
		bundle: false,

		driver: undefined,
		ignoreConflicts: false,
	});
});

test('generate #10 tsconfig paths', async () => {
	const originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
	process.env.TEST_CONFIG_PATH_PREFIX = './tests/fixtures/tsconfig-paths/';

	const filename = join(process.cwd(), 'tests/fixtures/tsconfig-paths/entry.ts');
	try {
		const res = await brotest(generate, '--config=drizzle.config.ts');
		if (res.type !== 'handler') assert.fail(res.type, 'handler');
		expect(res.options).toStrictEqual({
			dialect: 'postgresql',
			ignoreConflicts: false,
			name: undefined,
			custom: false,
			breakpoints: true,
			out: 'drizzle',
			bundle: false,

			driver: undefined,
			filenames: [filename],
		});
	} finally {
		if (originalPrefix === undefined) {
			delete process.env.TEST_CONFIG_PATH_PREFIX;
		} else {
			process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
		}
	}
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(generate, '--schema=src/schema.ts');
	assert.equal(res.type, 'error');
});

test('err #2', async (t) => {
	const res = await brotest(generate, '--dialect=postgresql');
	assert.equal(res.type, 'error');
});

test('err #3', async (t) => {
	const res = await brotest(generate, '--dialect=postgresql2');
	assert.equal(res.type, 'error');
});

test('err #4', async (t) => {
	const res = await brotest(generate, '--driver=expo');
	assert.equal(res.type, 'error');
});

test('err #5', async (t) => {
	const res = await brotest(generate, '--dialect=postgresql --out=out');
	assert.equal(res.type, 'error');
});

test('err #6', async (t) => {
	const res = await brotest(generate, '--config=drizzle.config.ts --out=out');
	assert.equal(res.type, 'error');
});

test('err #7', async (t) => {
	const res = await brotest(
		generate,
		'--config=drizzle.config.ts --schema=schema.ts',
	);
	assert.equal(res.type, 'error');
});

test('err #8', async (t) => {
	const res = await brotest(
		generate,
		'--config=drizzle.config.ts --dialect=postgresql',
	);
	assert.equal(res.type, 'error');
});

// should point to test/cli
const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';
test('validate config #1', async (t) => {
	const { path, name } = createConfig({
		dialect: 'postgresql',
		schema: 'schema.ts',
		dbCredentials: { url: '' },
		introspect: { casing: 'preserve' },
		strict: true,
		schemaFilter: ['public'],
		breakpoints: false,
	}, prefix);

	const res = await brotest(generate, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: GenerateConfig = {
		dialect: 'postgresql',
		filenames: [filename],
		breakpoints: false,
		bundle: false,
		custom: false,
		out: 'drizzle',
		driver: undefined,
		ignoreConflicts: false,
		name: undefined,
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #2', async (t) => {
	const { path, name } = createConfig({
		dialect: 'postgresql',
		schema: 'schema.ts',
		dbCredentials: { url: '' },
		introspect: { casing: 'preserve' },
		strict: true,
		schemaFilter: ['public'],
		breakpoints: true,
		driver: 'pglite',
		out: 'test',
		entities: {
			roles: true,
		},
		extensionsFilters: ['postgis'],
		verbose: false,
	}, prefix);

	const res = await brotest(generate, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: GenerateConfig = {
		dialect: 'postgresql',
		filenames: [filename],
		breakpoints: true,
		bundle: false,
		custom: false,
		out: 'test',
		driver: 'pglite',
		ignoreConflicts: false,
		name: undefined,
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #3', async (t) => {
	const spy = vi.spyOn(console, 'log');

	const { path, name } = createConfig(
		{ dialect: 'postgresql', driver: 'aws-data-api', out: 'test' },
		prefix,
	);

	const res = await brotest(generate, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');

	// first call
	expect(spy).toHaveBeenNthCalledWith(1, `Reading config file '${path}'`);
	// second call
	// we need to check second call
	expect(spy).toHaveBeenNthCalledWith(
		2,
		`Error  Please provide required params:
    [✓] dialect: 'postgresql'
    [x] schema: undefined`,
	);

	let error: any = res.type === 'error' ? res.error : undefined;
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe('process.exit unexpectedly called with "1"');

	spy.mockRestore();
});

test('validate config #4', async (t) => {
	const spyLog = vi.spyOn(console, 'log');
	const spyError = vi.spyOn(console, 'error');

	const { path, name } = createConfig(
		// @ts-expect-error
		{ dialect: 1, schema: 'path-to-schema' },
		prefix,
	);

	const res = await brotest(generate, `--config=${name}`);

	unlinkSync(path);

	// wrong dialect data type
	expect(res.type).toBe('error');

	expect(spyLog).toHaveBeenNthCalledWith(1, `Reading config file '${path}'`);
	expect(spyLog).toHaveBeenCalledTimes(1);

	expect(spyError).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));

	let error: any = res.type === 'error' ? res.error : undefined;
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe('process.exit unexpectedly called with "1"');

	spyLog.mockRestore();
	spyError.mockRestore();
});

test('validate config #5', async (t) => {
	const { path, name } = createConfig({
		dialect: 'sqlite',
		driver: 'd1-http',
		schema: 'schema.ts',
	}, prefix);

	const res = await brotest(generate, `--config=${name}`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: GenerateConfig = {
		dialect: 'sqlite',
		filenames: [filename],
		breakpoints: true,
		bundle: false,
		custom: false,
		out: 'drizzle',
		driver: 'd1-http',
		ignoreConflicts: false,
		name: undefined,
	};
	expect(res.options).toStrictEqual(expected);
});
