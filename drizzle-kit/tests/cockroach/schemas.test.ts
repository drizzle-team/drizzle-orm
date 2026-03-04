import { cockroachSchema } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('add schema #1', async ({ db }) => {
	const to = {
		devSchema: cockroachSchema('dev'),
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

test.concurrent('add schema #2', async ({ db }) => {
	const from = {
		devSchema: cockroachSchema('dev'),
	};
	const to = {
		devSchema: cockroachSchema('dev'),
		devSchema2: cockroachSchema('dev2'),
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

test.concurrent('delete schema #1', async ({ db }) => {
	const from = {
		devSchema: cockroachSchema('dev'),
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

test.concurrent('delete schema #2', async ({ db }) => {
	const from = {
		devSchema: cockroachSchema('dev'),
		devSchema2: cockroachSchema('dev2'),
	};
	const to = {
		devSchema: cockroachSchema('dev'),
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

test.concurrent('rename schema #1', async ({ db }) => {
	const from = {
		devSchema: cockroachSchema('dev'),
	};

	const to = {
		devSchema2: cockroachSchema('dev2'),
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

test.concurrent('rename schema #2', async ({ db }) => {
	const from = {
		devSchema: cockroachSchema('dev'),
		devSchema1: cockroachSchema('dev1'),
	};
	const to = {
		devSchema: cockroachSchema('dev'),
		devSchema2: cockroachSchema('dev2'),
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
