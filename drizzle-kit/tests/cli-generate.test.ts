import { test as brotest } from '@drizzle-team/brocli';
import { assert, expect, test } from 'vitest';
import { generate } from '../src/cli/schema';

// good:
// #1 drizzle-kit generate --dialect=postgresql --schema=schema.ts
// #2 drizzle-kit generate --dialect=postgresql --schema=schema.ts --out=out
// #3 drizzle-kit generate
// #4 drizzle-kit generate --custom
// #5 drizzle-kit generate --name=custom
// #6 drizzle-kit generate --prefix=timestamp
// #7 drizzle-kit generate --prefix=timestamp --name=custom --custom
// #8 drizzle-kit generate --config=drizzle1.config.ts
// #9 drizzle-kit generate --dialect=postgresql --schema=schema.ts --out=out --prefix=timestamp --name=custom --custom

// errors:
// #1 drizzle-kit generate --schema=src/schema.ts
// #2 drizzle-kit generate --dialect=postgresql
// #3 drizzle-kit generate --dialect=postgresql2
// #4 drizzle-kit generate --driver=expo
// #5 drizzle-kit generate --dialect=postgresql --out=out
// #6 drizzle-kit generate --config=drizzle.config.ts --out=out
// #7 drizzle-kit generate --config=drizzle.config.ts --schema=schema.ts
// #8 drizzle-kit generate --config=drizzle.config.ts --dialect=postgresql

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
		prefix: 'index',
		breakpoints: true,
		schema: 'schema.ts',
		out: 'drizzle',
		bundle: false,
		casing: undefined,
		driver: undefined,
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
		prefix: 'index',
		breakpoints: true,
		schema: 'schema.ts',
		out: 'out',
		bundle: false,
		casing: undefined,
		driver: undefined,
	});
});

test('generate #3', async (t) => {
	const res = await brotest(generate, '');

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: undefined,
		custom: false,
		prefix: 'index',
		breakpoints: true,
		schema: './schema.ts',
		out: 'drizzle',
		bundle: false,
		casing: undefined,
		driver: undefined,
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
		prefix: 'index',
		breakpoints: true,
		schema: './schema.ts',
		out: 'drizzle',
		bundle: false,
		casing: undefined,
		driver: undefined,
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
		prefix: 'index',
		breakpoints: true,
		schema: './schema.ts',
		out: 'drizzle',
		bundle: false,
		casing: undefined,
		driver: undefined,
	});
});

// config | pass through prefix
test('generate #6', async (t) => {
	const res = await brotest(generate, '--prefix=timestamp');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: undefined,
		custom: false,
		prefix: 'timestamp',
		breakpoints: true,
		schema: './schema.ts',
		out: 'drizzle',
		bundle: false,
		casing: undefined,
		driver: undefined,
	});
});

// config | pass through name, prefix and custom
test('generate #7', async (t) => {
	const res = await brotest(
		generate,
		'--prefix=timestamp --name=custom --custom',
	);
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: 'custom',
		custom: true,
		prefix: 'timestamp',
		breakpoints: true,
		schema: './schema.ts',
		out: 'drizzle',
		bundle: false,
		casing: undefined,
		driver: undefined,
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
		prefix: 'index',
		breakpoints: true,
		schema: './schema.ts',
		out: 'drizzle',
		bundle: true, // expo driver
		casing: undefined,
		driver: 'expo',
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
		prefix: 'index',
		breakpoints: true,
		schema: './schema.ts',
		out: 'drizzle',
		bundle: true, // expo driver
		casing: undefined,
		driver: 'durable-sqlite',
	});
});

// cli | pass through name, prefix and custom
test('generate #9', async (t) => {
	const res = await brotest(
		generate,
		'--dialect=postgresql --schema=schema.ts --out=out --prefix=timestamp --name=custom --custom',
	);

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		name: 'custom',
		custom: true,
		prefix: 'timestamp',
		breakpoints: true,
		schema: 'schema.ts',
		out: 'out',
		bundle: false,
		casing: undefined,
		driver: undefined,
	});
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
	const res = await brotest(generate, '--config=drizzle.config.ts --schema=schema.ts');
	assert.equal(res.type, 'error');
});

test('err #8', async (t) => {
	const res = await brotest(generate, '--config=drizzle.config.ts --dialect=postgresql');
	assert.equal(res.type, 'error');
});
