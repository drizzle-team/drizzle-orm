import { desc } from 'drizzle-orm';
import { cockroachTable, index, int4, primaryKey, text } from 'drizzle-orm/cockroach-core';
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

// https://github.com/drizzle-team/drizzle-orm/issues/4704
test.concurrent('issue No4704. Composite index with sort outputs', async ({ db }) => {
	const schema1 = {
		table: cockroachTable(
			'table',
			{ col1: int4(), col2: int4(), col3: int4() },
			(table) => [
				index('table_composite_idx').on(
					table.col1,
					table.col2,
					desc(table.col3), // Attempting to sort by col3 DESC
				),
			],
		),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE "table" (\n\t"col1" int4,\n\t"col2" int4,\n\t"col3" int4\n);\n',
		'CREATE INDEX "table_composite_idx" ON "table" ("col1","col2","col3" desc);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
});
