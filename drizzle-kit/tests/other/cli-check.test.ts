import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'node:fs';
import { afterEach, assert, expect, test, vi } from 'vitest';
import { CheckConfig } from '../../src/cli/commands/utils';
import { check } from '../../src/cli/schema';
import { wrapParam } from '../../src/cli/validations/common';
import { error } from '../../src/cli/views';
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

	const expected: CheckConfig = {
		dialect: 'postgresql',
		out: 'drizzle',
		ignoreConflicts: false,
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #2', async (t) => {
	const res = await brotest(check, `--dialect=postgresql --out=test --ignore-conflicts=true`);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: CheckConfig = {
		dialect: 'postgresql',
		out: 'test',
		ignoreConflicts: true,
	};
	expect(res.options).toStrictEqual(expected);
});

test('validate config #3', async (t) => {
	const { path, name } = createConfig({ dialect: 'postgresql', out: 'test' }, prefix);

	const res = await brotest(check, `--config=${name}`);

	unlinkSync(path);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	const expected: CheckConfig = {
		dialect: 'postgresql',
		out: 'test',
		ignoreConflicts: undefined,
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
	expect((res.error as Error).message).toBe(error("Please specify 'dialect' param in config file"));
});

test('validate config #5', async (t) => {
	const res = await brotest(check, `--out=test`);

	expect(res.type).toBe('error');
	if (res.type !== 'error') return;
	expect((res.error as Error).message).toBe(
		[error('Please provide required params:'), wrapParam('dialect', undefined)].join('\n'),
	);
});
