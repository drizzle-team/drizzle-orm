import { test as brotest } from '@drizzle-team/brocli';
import { join } from 'node:path';
import { assert, expect, test } from 'vitest';
import { generate } from '../../src/cli/schema';

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
		casing: undefined,
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
		casing: undefined,
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
		casing: undefined,
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
		casing: undefined,
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
		casing: undefined,
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
		casing: undefined,
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
		casing: undefined,
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
		casing: undefined,
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
		casing: undefined,
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
		casing: undefined,
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
			casing: undefined,
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
