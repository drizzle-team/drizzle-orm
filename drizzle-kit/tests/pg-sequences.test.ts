import { pgSchema, pgSequence } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('create sequence', async () => {
	const from = {};
	const to = {
		seq: pgSequence('name', { startWith: 100 }),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			name: 'name',
			schema: 'public',
			type: 'create_sequence',
			values: {
				cache: '1',
				cycle: false,
				increment: '1',
				maxValue: '9223372036854775807',
				minValue: '1',
				startWith: '100',
			},
		},
	]);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			type: 'create_sequence',
			name: 'name',
			schema: 'public',
			values: {
				startWith: '100',
				maxValue: '10000',
				minValue: '100',
				cycle: true,
				cache: '10',
				increment: '2',
			},
		},
	]);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			name: 'name',
			schema: 'custom',
			type: 'create_sequence',
			values: {
				cache: '1',
				cycle: false,
				increment: '1',
				maxValue: '9223372036854775807',
				minValue: '1',
				startWith: '100',
			},
		},
	]);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			type: 'create_sequence',
			name: 'name',
			schema: 'custom',
			values: {
				startWith: '100',
				maxValue: '10000',
				minValue: '100',
				cycle: true,
				cache: '10',
				increment: '2',
			},
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE SEQUENCE "custom"."name" INCREMENT BY 2 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	]);
});

test('drop sequence', async () => {
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = {};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			type: 'drop_sequence',
			name: 'name',
			schema: 'public',
		},
	]);
	expect(sqlStatements).toStrictEqual(['DROP SEQUENCE "public"."name";']);
});

test('drop sequence: custom schema', async () => {
	const customSchema = pgSchema('custom');
	const from = { seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = {};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			type: 'drop_sequence',
			name: 'name',
			schema: 'custom',
		},
	]);
	expect(sqlStatements).toStrictEqual(['DROP SEQUENCE "custom"."name";']);
});

// rename sequence

test('rename sequence', async () => {
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = { seq: pgSequence('name_new', { startWith: 100 }) };

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.name->public.name_new',
	]);

	expect(statements).toStrictEqual([
		{
			type: 'rename_sequence',
			nameFrom: 'name',
			nameTo: 'name_new',
			schema: 'public',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "public"."name" RENAME TO "name_new";',
	]);
});

test('rename sequence in custom schema', async () => {
	const customSchema = pgSchema('custom');

	const from = { seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { seq: customSchema.sequence('name_new', { startWith: 100 }) };

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'custom.name->custom.name_new',
	]);

	expect(statements).toStrictEqual([
		{
			type: 'rename_sequence',
			nameFrom: 'name',
			nameTo: 'name_new',
			schema: 'custom',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "custom"."name" RENAME TO "name_new";',
	]);
});

test('move sequence between schemas #1', async () => {
	const customSchema = pgSchema('custom');
	const from = { seq: pgSequence('name', { startWith: 100 }) };
	const to = { seq: customSchema.sequence('name', { startWith: 100 }) };

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.name->custom.name',
	]);

	expect(statements).toStrictEqual([
		{
			type: 'move_sequence',
			name: 'name',
			schemaFrom: 'public',
			schemaTo: 'custom',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "public"."name" SET SCHEMA "custom";',
	]);
});

test('move sequence between schemas #2', async () => {
	const customSchema = pgSchema('custom');
	const from = { seq: customSchema.sequence('name', { startWith: 100 }) };
	const to = { seq: pgSequence('name', { startWith: 100 }) };

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'custom.name->public.name',
	]);

	expect(statements).toStrictEqual([
		{
			type: 'move_sequence',
			name: 'name',
			schemaFrom: 'custom',
			schemaTo: 'public',
		},
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements).toStrictEqual([
		{
			name: 'name',
			schema: 'public',
			type: 'alter_sequence',
			values: {
				cache: '1',
				cycle: false,
				increment: '1',
				maxValue: '9223372036854775807',
				minValue: '1',
				startWith: '105',
			},
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "public"."name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 105 CACHE 1;',
	]);
});
