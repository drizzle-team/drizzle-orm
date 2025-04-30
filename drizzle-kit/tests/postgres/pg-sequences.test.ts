import { pgSchema, pgSequence } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('create sequence', async () => {
	const to = {
		seq: pgSequence('name', { startWith: 100 }),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE SEQUENCE "public"."name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;',
	]);
});

test('create sequence: all fields', async () => {
	const from = {};
	const to = {
		seq: pgSequence('name', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const {  sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE SEQUENCE "public"."name" INCREMENT BY 2 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	]);
});

test('create sequence: custom schema', async () => {
	const customSchema = pgSchema('custom');
	const from = {};
	const to = {
		seq: customSchema.sequence('name', { startWith: 100 }),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE SEQUENCE "custom"."name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;',
	]);
});

test('create sequence: custom schema + all fields', async () => {
	const customSchema = pgSchema('custom');
	const from = {};
	const to = {
		seq: customSchema.sequence('name', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE SEQUENCE "custom"."name" INCREMENT BY 2 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	]);
});

test('drop sequence', async () => {
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = {};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(['DROP SEQUENCE "public"."name";']);
});

test('drop sequence: custom schema', async () => {
	const customSchema = pgSchema('custom');
	const from = { seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = {};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(['DROP SEQUENCE "custom"."name";']);
});

// rename sequence

test('rename sequence', async () => {
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = { seq: pgSequence('name_new', { startWith: 100 }) };

	const { sqlStatements } = await diff(from, to, [
		'public.name->public.name_new',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "name" RENAME TO "name_new";',
	]);
});

test('rename sequence in custom schema', async () => {
	const customSchema = pgSchema('custom');

	const from = { seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { seq: customSchema.sequence('name_new', { startWith: 100 }) };

	const { sqlStatements } = await diff(from, to, [
		'custom.name->custom.name_new',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "custom"."name" RENAME TO "name_new";',
	]);
});

test('move sequence between schemas #1', async () => {
	const customSchema = pgSchema('custom');
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = { seq: customSchema.sequence('name', { startWith: 100 }) };

	const { sqlStatements } = await diff(from, to, [
		'public.name->custom.name',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "name" SET SCHEMA "custom";',
	]);
});

test('move sequence between schemas #2', async () => {
	const customSchema = pgSchema('custom');
	const from = { seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { seq: pgSequence('name', { startWith: 100 }) };

	const { sqlStatements } = await diff(from, to, [
		'custom.name->public.name',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "custom"."name" SET SCHEMA "public";',
	]);
});

// Add squasher for sequences to make alters work +
// Run all tests +
// Finish introspect for sequences +
// Check push for sequences +

// add tests for generated to postgresql +
// add tests for generated to mysql +
// add tests for generated to sqlite +

// add tests for identity to postgresql

// check introspect generated(all dialects) +
// check push generated(all dialect) +

// add introspect ts file logic for all the features
// manually test everything
// beta release

test('alter sequence', async () => {
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = { seq: pgSequence('name', { startWith: 105 }) };

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 105 CACHE 1;',
	]);
});
