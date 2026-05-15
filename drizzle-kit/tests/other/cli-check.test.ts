import { test as brotest } from '@drizzle-team/brocli';
import { unlinkSync } from 'node:fs';
import { CheckConfig } from 'src/cli/commands/utils';
import { check } from 'src/cli/schema';
import { assert, expect, test, vi } from 'vitest';
import { createConfig } from './utils';

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
	const spy = vi.spyOn(console, 'log');

	const { path, name } = createConfig(
		// @ts-expect-error
		{ out: 'test' },
		prefix,
	);

	const res = await brotest(check, `--config=${name}`);

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

test('validate config #5', async (t) => {
	const spy = vi.spyOn(console, 'log');

	const res = await brotest(check, `--out=test`);

	expect(res.type).toBe('error');

	expect(spy).toHaveBeenCalledWith(
		`Error  Please provide required params:
    [x] dialect: undefined`,
	);

	let error: any = res.type === 'error' ? res.error : undefined;
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe('process.exit unexpectedly called with "1"');

	spy.mockRestore();
});
