import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, assert, expect, test, vi } from 'vitest';
import { ExportConfig } from '../../src/cli/commands/utils';
import { exportRaw } from '../../src/cli/schema';
import { wrapParam } from '../../src/cli/validations/common';
import { error } from '../../src/cli/views';
import { createConfig } from './utils';

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
// #1 drizzle-kit export --dialect=postgresql --schema=schema.ts
// #3 drizzle-kit export
// #3 drizzle-kit export --config=drizzle1.config.ts

// errors:
// #1 drizzle-kit export --schema=src/schema.ts
// #2 drizzle-kit export --dialect=postgresql
// #3 drizzle-kit export --dialect=postgresql2
// #4 drizzle-kit export --config=drizzle.config.ts --schema=schema.ts
// #5 drizzle-kit export --config=drizzle.config.ts --dialect=postgresql

const filename = join(process.cwd(), 'tests/cli/schema.ts');
test('export #1', async (t) => {
	const res = await brotest(
		exportRaw,
		'--dialect=postgresql --schema=schema.ts',
	);

	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		filenames: [filename],
		sql: true,
		output: 'text',
	});
});

test('export #2', async (t) => {
	const res = await brotest(exportRaw, '');

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		filenames: [filename],
		sql: true,
		output: 'text',
	});
});

// custom config path
test('export #3', async (t) => {
	const res = await brotest(exportRaw, '--config=expo.config.ts');
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		filenames: [filename],
		sql: true,
		output: 'text',
	});
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(exportRaw, '--schema=src/schema.ts');
	assert.equal(res.type, 'error');
});

test('err #2', async (t) => {
	const res = await brotest(exportRaw, '--dialect=postgresql');
	assert.equal(res.type, 'error');
});

test('err #3', async (t) => {
	const res = await brotest(exportRaw, '--dialect=postgresql2');
	assert.equal(res.type, 'error');
});

test('err #4', async (t) => {
	const res = await brotest(exportRaw, '--config=drizzle.config.ts --schema=schema.ts');
	assert.equal(res.type, 'error');
});

test('err #5', async (t) => {
	const res = await brotest(exportRaw, '--config=drizzle.config.ts --dialect=postgresql');
	assert.equal(res.type, 'error');
});

// should point to test/cli
const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';
test('validate config #1', async (t) => {
	const { path, name } = createConfig({ dialect: 'postgresql', schema: 'schema.ts' }, prefix);

	const res = await brotest(exportRaw, `--config=${name} --sql=false`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: ExportConfig = {
		dialect: 'postgresql',
		filenames: [filename],
		sql: false,
		output: 'text',
	};
	expect(res.options).toStrictEqual(expected);
});
test('validate config #2', async (t) => {
	const { path, name } = createConfig(
		{ dialect: 'postgresql', schema: 'schema.ts' },
		prefix,
	);

	const res = await brotest(exportRaw, `--config=${name} --sql=true`);

	unlinkSync(path);
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: ExportConfig = {
		dialect: 'postgresql',
		filenames: [filename],
		sql: true,
		output: 'text',
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #3', async (t) => {
	const { path, name } = createConfig(
		{ dialect: 'postgresql' },
		prefix,
	);

	const res = await brotest(exportRaw, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');
	if (res.type !== 'error') return;
	expect((res.error as Error).message).toBe(
		[
			error('Please provide required params:'),
			wrapParam('dialect', 'postgresql'),
			wrapParam('schema', undefined),
		].join('\n'),
	);
});

test('validate config #4', async (t) => {
	const { path, name } = createConfig(
		// @ts-expect-error
		{ schema: 'schema.ts' },
		prefix,
	);

	const res = await brotest(exportRaw, `--config=${name}`);

	unlinkSync(path);

	expect(res.type).toBe('error');
	if (res.type !== 'error') return;
	expect((res.error as Error).message).toBe(
		[
			error('Please provide required params:'),
			wrapParam('dialect', undefined),
			wrapParam('schema', 'schema.ts'),
		].join('\n'),
	);
});
