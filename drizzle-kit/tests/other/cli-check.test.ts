import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'node:fs';
import { afterEach, assert, expect, test } from 'vitest';
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
