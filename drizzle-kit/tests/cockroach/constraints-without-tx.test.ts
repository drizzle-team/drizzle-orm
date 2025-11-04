import { cockroachTable, int4, primaryKey, text } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('alter table add composite pk', async ({ dbc: db }) => {
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

test.concurrent('pk #5', async ({ db }) => {
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
