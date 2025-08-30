import { cockroachTable, int4, primaryKey } from 'drizzle-orm/cockroach-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase(false);
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('with composite pks #2', async (t) => {
	const schema1 = {
		users: cockroachTable('users', {
			id1: int4('id1'),
			id2: int4('id2'),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id1: int4('id1').notNull(),
			id2: int4('id2').notNull(),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "users" ALTER COLUMN "id1" SET NOT NULL;',
		'ALTER TABLE "users" ALTER COLUMN "id2" SET NOT NULL;',
		'ALTER TABLE "users" ADD CONSTRAINT "compositePK" PRIMARY KEY("id1","id2");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
