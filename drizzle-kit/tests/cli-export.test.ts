import { test as brotest } from '@drizzle-team/brocli';
import { assert, expect, test } from 'vitest';
import { exportRaw } from '../src/cli/schema';

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

test('export #1', async (t) => {
	const res = await brotest(
		exportRaw,
		'--dialect=postgresql --schema=schema.ts',
	);

	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		schema: 'schema.ts',
		sql: true,
	});
});

test('export #2', async (t) => {
	const res = await brotest(exportRaw, '');

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		schema: './schema.ts',
		sql: true,
	});
});

// custom config path
test('export #3', async (t) => {
	const res = await brotest(exportRaw, '--config=expo.config.ts');
	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		schema: './schema.ts',
		sql: true,
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
