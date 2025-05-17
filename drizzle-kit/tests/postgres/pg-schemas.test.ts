import { pgSchema } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('add schema #1', async () => {
	const to = {
		devSchema: pgSchema('dev'),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE SCHEMA "dev";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add schema #2', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};
	const to = {
		devSchema: pgSchema('dev'),
		devSchema2: pgSchema('dev2'),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE SCHEMA "dev2";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('delete schema #1', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};

	const { sqlStatements: st } = await diff(from, {}, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to: {},
	});

	const st0 = [
		'DROP SCHEMA "dev";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('delete schema #2', async () => {
	const from = {
		devSchema: pgSchema('dev'),
		devSchema2: pgSchema('dev2'),
	};
	const to = {
		devSchema: pgSchema('dev'),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'DROP SCHEMA "dev2";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename schema #1', async () => {
	const from = {
		devSchema: pgSchema('dev'),
	};

	const to = {
		devSchema2: pgSchema('dev2'),
	};

	const renames = ['dev->dev2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER SCHEMA "dev" RENAME TO "dev2";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename schema #2', async () => {
	const from = {
		devSchema: pgSchema('dev'),
		devSchema1: pgSchema('dev1'),
	};
	const to = {
		devSchema: pgSchema('dev'),
		devSchema2: pgSchema('dev2'),
	};

	const renames = ['dev1->dev2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER SCHEMA "dev1" RENAME TO "dev2";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
