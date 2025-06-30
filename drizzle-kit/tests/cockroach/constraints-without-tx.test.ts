import { sql } from 'drizzle-orm';
import {
	AnyCockroachColumn,
	cockroachTable,
	foreignKey,
	index,
	int4,
	primaryKey,
	text,
	unique,
	varchar,
} from 'drizzle-orm/cockroach-core';
import { DB } from 'src/utils';
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

test('alter table add composite pk', async (t) => {
	const schema1 = {
		table: cockroachTable('table', {
			id1: int4('id1').notNull(),
			id2: int4('id2').notNull(),
		}),
	};

	const schema2 = {
		table: cockroachTable('table', {
			id1: int4('id1').notNull(),
			id2: int4('id2').notNull(),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]),
	};

	const { sqlStatements: st } = await diff(
		schema1,
		schema2,
		[],
	);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = ['ALTER TABLE "table" ADD PRIMARY KEY ("id1","id2");'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #5', async () => {
	const from = {
		users: cockroachTable('users', {
			name: text().notNull(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: cockroachTable('users', {
			name: text().notNull(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" DROP CONSTRAINT "users_pkey";']);
	await expect(push({ db, to })).rejects.toThrow(); // can not drop pk without adding new one
});

test('pk multistep #1', async () => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY\n);\n']);

	const sch2 = {
		users: cockroachTable('users2', {
			name: text('name2').primaryKey(),
		}),
	};

	const renames = [
		'public.users->public.users2',
		'public.users2.name->public.users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" RENAME COLUMN "name" TO "name2";',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);

	expect(st4).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_pkey";']);
	await expect(push({ db, to: sch3 })).rejects.toThrow(); // can not drop pk without adding new one
});

test('pk multistep #2', async () => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY\n);\n']);

	const sch2 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const renames = [
		'public.users->public.users2',
		'public.users2.name->public.users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" RENAME COLUMN "name" TO "name2";',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}, (t) => [primaryKey({ name: 'users2_pk', columns: [t.name] })]),
	};

	const renames2 = ['public.users2.users_pkey->public.users2.users2_pk'];
	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, renames2);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, renames: renames2 });

	expect(st4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_pkey" TO "users2_pk";']);
	expect(pst4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_pkey" TO "users2_pk";']);

	const sch4 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);

	expect(st5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users2_pk";']);
	await expect(push({ db, to: sch4 })).rejects.toThrowError(); // can not drop pk without adding new one
});

test('pk multistep #3', async () => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY\n);\n']);

	const sch2 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const renames = [
		'public.users->public.users2',
		'public.users2.name->public.users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" RENAME COLUMN "name" TO "name2";',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}, (t) => [primaryKey({ name: 'users2_pk', columns: [t.name] })]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e4 = [
		'ALTER TABLE "users2" DROP CONSTRAINT "users_pkey", ADD CONSTRAINT "users2_pk" PRIMARY KEY("name2");',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);

	expect(st5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users2_pk";']);
	await expect(push({ db, to: sch4 })).rejects.toThrowError(); // can not drop pk without adding new one
});
