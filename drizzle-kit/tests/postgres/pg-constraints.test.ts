import { and, isNull, SQL, sql } from 'drizzle-orm';
import {
	AnyPgColumn,
	bigint,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDatabase } from 'src/ext/studio-postgres';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, drizzleToDDL, prepareTestDatabase, push, TestDatabase } from './mocks';

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

test('unique #1', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD CONSTRAINT "users_name_key" UNIQUE("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #2', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique('unique_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #3', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique('unique_name', { nulls: 'distinct' }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #4', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique('unique_name', { nulls: 'not distinct' }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE NULLS NOT DISTINCT("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #5', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique('unique_name', { nulls: 'not distinct' }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE NULLS NOT DISTINCT("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #6', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #7', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name).nullsNotDistinct()]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE NULLS NOT DISTINCT("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #8', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" DROP CONSTRAINT "unique_name";`,
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name2" UNIQUE("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #9', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'public.users.unique_name->public.users.unique_name2',
	]);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [
			'public.users.unique_name->public.users.unique_name2',
		],
	});

	const st0 = [
		`ALTER TABLE "users" RENAME CONSTRAINT "unique_name" TO "unique_name2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #10', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
			email: text().unique(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
			email2: text().unique(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'public.users.email->public.users.email2',
		'public.users.unique_name->public.users.unique_name2',
	]);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [
			'public.users.email->public.users.email2',
			'public.users.unique_name->public.users.unique_name2',
		],
	});

	const st0 = [
		`ALTER TABLE "users" RENAME COLUMN "email" TO "email2";`,
		`ALTER TABLE "users" RENAME CONSTRAINT "unique_name" TO "unique_name2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #11', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
			email: text(),
		}, (t) => [
			unique('unique_name').on(t.name),
			unique('unique_email').on(t.email),
		]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
			email: text(),
		}, (t) => [
			unique('unique_name2').on(t.name),
			unique('unique_email2').on(t.email),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'public.users.unique_name->public.users.unique_name2',
	]);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [
			'public.users.unique_name->public.users.unique_name2',
		],
	});

	const st0 = [
		`ALTER TABLE "users" DROP CONSTRAINT "unique_email";`,
		`ALTER TABLE "users" RENAME CONSTRAINT "unique_name" TO "unique_name2";`,
		`ALTER TABLE "users" ADD CONSTRAINT "unique_email2" UNIQUE("email");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* rename table, unfortunately has to trigger constraint recreate */
test('unique #12', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
			email: text().unique(),
		}),
	};
	const to = {
		users: pgTable('users2', {
			name: text(),
			email: text().unique(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'public.users->public.users2',
	]);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [
			'public.users->public.users2',
		],
	});

	const st0 = [
		'ALTER TABLE "users" RENAME TO "users2";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #13', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text(),
			email: text().unique(),
		}),
	};
	const sch2 = {
		users: pgTable('users2', {
			name: text(),
			email2: text().unique('users_email_key'),
		}),
	};

	const sch3 = {
		users: pgTable('users2', {
			name: text(),
			email2: text(),
		}),
	};

	// sch1 -> sch2
	const { sqlStatements: st1, next: n1 } = await diff(sch1, sch2, [
		'public.users->public.users2',
		'public.users2.email->public.users2.email2',
	]);

	await push({ db, to: sch1 });
	const { sqlStatements: pst1 } = await push({
		db,
		to: sch2,
		renames: [
			'public.users->public.users2',
			'public.users2.email->public.users2.email2',
		],
	});

	const st10 = [
		`ALTER TABLE "users" RENAME TO "users2";`,
		`ALTER TABLE "users2" RENAME COLUMN "email" TO "email2";`,
	];
	expect(st1).toStrictEqual(st10);
	expect(pst1).toStrictEqual(st10);

	// sch2 -> sch3
	const { sqlStatements: st2 } = await diff(n1, sch3, []);

	const { sqlStatements: pst2 } = await push({
		db,
		to: sch3,
	});

	const st20 = [
		'ALTER TABLE "users2" DROP CONSTRAINT "users_email_key";',
	];
	expect(st2).toStrictEqual(st20);
	expect(pst2).toStrictEqual(st20);
});

test('unique multistep #1', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = ['CREATE TABLE "users" (\n\t"name" text UNIQUE\n);\n'];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2').unique(),
		}),
	};

	const renames = ['public.users->public.users2', 'public.users2.name->public.users2.name2'];
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
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e3 = ['ALTER TABLE "users2" DROP CONSTRAINT "users_name_key";'];

	expect(pst4).toStrictEqual(e3);
	expect(st4).toStrictEqual(e3);
});

test('unique multistep #2', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });
	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text UNIQUE\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text UNIQUE\n);\n']);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2').unique(),
		}),
	};

	const r1 = [
		'public.users->public.users2',
		'public.users2.name->public.users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, r1);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames: r1 });

	const e2 = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" RENAME COLUMN "name" TO "name2";',
	];
	expect(pst2).toStrictEqual(e2);
	expect(st2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [unique().on(t.name)]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });
	expect(st4).toStrictEqual([]);
	expect(pst4).toStrictEqual([]);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });
	expect(st5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_name_key";']);
	expect(pst5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_name_key";']);
});

test('unique multistep #3', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text UNIQUE\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text UNIQUE\n);\n']);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2').unique(),
		}),
	};

	const renames = ['public.users->public.users2', 'public.users2.name->public.users2.name2'];
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
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [unique('name_unique').on(t.name)]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e4 = [
		'ALTER TABLE "users2" DROP CONSTRAINT "users_name_key";',
		'ALTER TABLE "users2" ADD CONSTRAINT "name_unique" UNIQUE("name2");',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });
	expect(st5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "name_unique";']);
	expect(pst5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "name_unique";']);
});

test('unique multistep #4', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });
	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text UNIQUE\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text UNIQUE\n);\n']);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2').unique(),
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
	const { sqlStatements: pst3 } = await push({ db, to: sch2, renames });
	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [unique('name_unique').on(t.name)]),
	};

	const renames2 = ['public.users2.users_name_key->public.users2.name_unique'];
	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, renames2);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, renames: renames2 });

	expect(st4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_name_key" TO "name_unique";']);
	expect(pst4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_name_key" TO "name_unique";']);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });
	expect(st5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "name_unique";']);
	expect(pst5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "name_unique";']);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4789
test('unique multistep #5', async () => {
	const table1 = pgTable('table1', {
		column1: integer().notNull().primaryKey(),
		column2: integer().notNull(),
	}, (table) => [
		unique().on(table.column1, table.column2),
	]);
	const table2 = pgTable('table2', {
		column1: integer().notNull(),
		column2: integer().notNull(),
	}, (table) => [
		foreignKey({
			columns: [table.column2, table.column1],
			foreignColumns: [table1.column2, table1.column1],
		}),
	]);
	const sch1 = { table1, table2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });
	const expectedSt1 = [
		'CREATE TABLE "table1" (\n'
		+ '\t"column1" integer PRIMARY KEY,\n'
		+ '\t"column2" integer NOT NULL,\n'
		+ '\tCONSTRAINT "table1_column1_column2_unique" UNIQUE("column1","column2")\n'
		+ ');\n',
		'CREATE TABLE "table2" (\n\t"column1" integer NOT NULL,\n\t"column2" integer NOT NULL\n);\n',
		'ALTER TABLE "table2" ADD CONSTRAINT "table2_column2_column1_table1_column2_column1_fkey" FOREIGN KEY ("column2","column1") REFERENCES "table1"("column2","column1");',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, sch1, []);
	const { sqlStatements: pst2 } = await push({ db, to: sch1 });

	const expectedSt2: string[] = [];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4638
test('uniqueIndex multistep #1', async () => {
	const table1 = pgTable('table1', {
		column1: integer().notNull().primaryKey(),
		column2: integer().notNull(),
	}, (table) => [
		uniqueIndex('table1_unique').on(table.column1, table.column2),
	]);
	const table2 = pgTable('table2', {
		column1: integer().notNull(),
		column2: integer().notNull(),
	}, (table) => [
		foreignKey({
			columns: [table.column1, table.column2],
			foreignColumns: [table1.column1, table1.column2],
		}),
	]);
	const sch1 = { table1, table2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });
	const expectedSt1 = [
		'CREATE TABLE "table1" (\n'
		+ '\t"column1" integer PRIMARY KEY,\n'
		+ '\t"column2" integer NOT NULL\n'
		+ ');\n',
		'CREATE TABLE "table2" (\n\t"column1" integer NOT NULL,\n\t"column2" integer NOT NULL\n);\n',
		'CREATE UNIQUE INDEX "table1_unique" ON "table1" ("column1","column2");',
		'ALTER TABLE "table2" ADD CONSTRAINT "table2_column1_column2_table1_column1_column2_fkey" FOREIGN KEY ("column1","column2") REFERENCES "table1"("column1","column2");',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, sch1, []);
	const { sqlStatements: pst2 } = await push({ db, to: sch1 });

	const expectedSt2: string[] = [];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('index multistep #1', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [index().on(t.name)]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"name" text\n);\n',
		'CREATE INDEX "users_name_index" ON "users" ("name");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [index().on(t.name)]),
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
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	expect(st4).toStrictEqual(['DROP INDEX "users_name_index";']);
	expect(pst4).toStrictEqual(['DROP INDEX "users_name_index";']);
});

test('index multistep #2', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [index().on(t.name)]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"name" text\n);\n',
		'CREATE INDEX "users_name_index" ON "users" ("name");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [index().on(t.name)]),
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

	const sch3 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [index('name2_idx').on(t.name)]),
	};

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch3, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch3 });

	const e3 = [
		'DROP INDEX "users_name_index";',
		'CREATE INDEX "name2_idx" ON "users2" ("name2");',
	];
	expect(st3).toStrictEqual(e3);
	expect(pst3).toStrictEqual(e3);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch4, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch4 });
	expect(st4).toStrictEqual(['DROP INDEX "name2_idx";']);
	expect(pst4).toStrictEqual(['DROP INDEX "name2_idx";']);
});

test('index multistep #3', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [index().on(t.name)]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"name" text\n);\n',
		'CREATE INDEX "users_name_index" ON "users" ("name");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [index().on(t.name)]),
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

	const sch3 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [index('name2_idx').on(t.name)]),
	};

	const renames2 = [
		'public.users2.users_name_index->public.users2.name2_idx',
	];
	const { sqlStatements: st3, next: n3 } = await diff(n2, sch3, renames2);
	const { sqlStatements: pst3 } = await push({ db, to: sch3, renames: renames2 });

	expect(st3).toStrictEqual(['ALTER INDEX "users_name_index" RENAME TO "name2_idx";']);
	expect(pst3).toStrictEqual(['ALTER INDEX "users_name_index" RENAME TO "name2_idx";']);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch4, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch4 });
	expect(st4).toStrictEqual(['DROP INDEX "name2_idx";']);
	expect(pst4).toStrictEqual(['DROP INDEX "name2_idx";']);
});

test('index multistep #3', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [index().on(t.name)]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"name" text\n);\n',
		'CREATE INDEX "users_name_index" ON "users" ("name");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [index().on(t.name)]),
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

	const sch3 = {
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [index('name2_idx').on(t.name)]),
	};

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch3, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch3 });

	const e3 = [
		'DROP INDEX "users_name_index";',
		'CREATE INDEX "name2_idx" ON "users2" ("name2");',
	];
	expect(st3).toStrictEqual(e3);
	expect(pst3).toStrictEqual(e3);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch4, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch4 });

	expect(st4).toStrictEqual(['DROP INDEX "name2_idx";']);
	expect(pst4).toStrictEqual(['DROP INDEX "name2_idx";']);
});

test('pk #1', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};

	const to = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(st).toStrictEqual(['ALTER TABLE "users" ADD PRIMARY KEY ("name");']);
	expect(pst).toStrictEqual(['ALTER TABLE "users" ADD PRIMARY KEY ("name");']);
});

test('pk #2', async () => {
	const from = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #3', async () => {
	const from = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #4', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #5', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: pgTable('users', {
			name: text(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "users" DROP CONSTRAINT "users_pkey";',
		'ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;',
	];
	expect(sqlStatements).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #6', async () => {
	const from = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};

	const to = {
		users: pgTable('users', {
			name: text(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "users" DROP CONSTRAINT "users_pkey";',
		'ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;',
	];
	expect(sqlStatements).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4779
// https://github.com/drizzle-team/drizzle-orm/issues/4944
test('pk multistep #1', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text PRIMARY KEY\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text PRIMARY KEY\n);\n']);

	const sch2 = {
		users: pgTable('users2', {
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
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const st04 = [
		'ALTER TABLE "users2" DROP CONSTRAINT "users_pkey";',
		'ALTER TABLE "users2" ALTER COLUMN "name2" DROP NOT NULL;',
	];
	expect(st4).toStrictEqual(st04);
	expect(pst4).toStrictEqual(st04);
});

test('pk multistep #2', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text().primaryKey().notNull(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text PRIMARY KEY\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text PRIMARY KEY\n);\n']);

	const sch2 = {
		users: pgTable('users2', {
			name: text('name2').notNull(),
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
		users: pgTable('users2', {
			name: text('name2').notNull(),
		}, (t) => [primaryKey({ name: 'users2_pk', columns: [t.name] })]),
	};

	const renames2 = ['public.users2.users_pkey->public.users2.users2_pk'];
	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, renames2);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, renames: renames2 });

	expect(st4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_pkey" TO "users2_pk";']);
	expect(pst4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_pkey" TO "users2_pk";']);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2').notNull(),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });

	expect(st5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users2_pk";']);
	expect(pst5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users2_pk";']);
});

test('pk multistep #3', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text PRIMARY KEY\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" text PRIMARY KEY\n);\n']);

	const sch2 = {
		users: pgTable('users2', {
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
		users: pgTable('users2', {
			name: text('name2'),
		}, (t) => [primaryKey({ name: 'users2_pk', columns: [t.name] })]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e4 = [
		'ALTER TABLE "users2" DROP CONSTRAINT "users_pkey";',
		'ALTER TABLE "users2" ADD CONSTRAINT "users2_pk" PRIMARY KEY("name2");',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });

	const st05 = [
		'ALTER TABLE "users2" DROP CONSTRAINT "users2_pk";',
		'ALTER TABLE "users2" ALTER COLUMN "name2" DROP NOT NULL;',
	];
	expect(st5).toStrictEqual(st05);
	expect(pst5).toStrictEqual(st05);
});

test('pk multistep #4', async () => {
	const sch1 = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}, (t) => [
			primaryKey({ name: 'users_pk', columns: [t.name] }),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" text,\n\tCONSTRAINT "users_pk" PRIMARY KEY("name")\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" text,\n\tCONSTRAINT "users_pk" PRIMARY KEY("name")\n);\n',
	]);

	const sch2 = {
		users: pgTable('users2', {
			name: text().primaryKey(),
		}, (t) => [
			primaryKey({ name: 'users_pk', columns: [t.name] }),
		]),
	};

	const renames = ['public.users->public.users2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE "users" RENAME TO "users2";',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3380
// https://github.com/drizzle-team/drizzle-orm/issues/3189
test('composite pk multistep #1', async () => {
	const table1 = pgTable('table1', {
		id: text('id').notNull(),
		dbtProjectId: text('dbt_project_id').notNull(),
	}, (table) => [
		primaryKey({ columns: [table.dbtProjectId, table.id] }),
	]);

	const table2 = pgTable('table2', {
		dbtProjectId: text('dbt_project_id').notNull(),
		dbtBranchId: text('dbt_branch_id').notNull(),
	}, (t) => [
		foreignKey({
			columns: [t.dbtProjectId, t.dbtBranchId],
			foreignColumns: [table1.dbtProjectId, table1.id],
		}),
	]);

	const schema = { table1, table2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, schema, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });
	const expectedSt1 = [
		'CREATE TABLE "table1" (\n'
		+ '\t"id" text,\n'
		+ '\t"dbt_project_id" text,\n'
		+ '\tCONSTRAINT "table1_pkey" PRIMARY KEY("dbt_project_id","id")\n'
		+ ');\n',
		'CREATE TABLE "table2" (\n'
		+ '\t"dbt_project_id" text NOT NULL,\n'
		+ '\t"dbt_branch_id" text NOT NULL\n'
		+ ');\n',
		'ALTER TABLE "table2" ADD CONSTRAINT "table2_kbxVCdKFtrgY_fkey" FOREIGN KEY ("dbt_project_id","dbt_branch_id") REFERENCES "table1"("dbt_project_id","id");',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3496
test('remove/add pk', async (t) => {
	const Step = pgTable('Step', {
		id: bigint({ mode: 'number' }).primaryKey(),
	});
	const schema1 = {
		Step1: Step,
		Branch: pgTable('Branch', {
			id: bigint({ mode: 'number' }).primaryKey(),
			stepId: bigint({ mode: 'number' }).references(() => Step.id, { onDelete: 'cascade' }),
		}),
	};
	const schema2 = {
		Step,
		Branch: pgTable('Branch', {
			stepId: bigint({ mode: 'number' }).primaryKey().references(() => Step.id, { onDelete: 'cascade' }),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2 = [
		'ALTER TABLE "Branch" DROP COLUMN "id";',
		'ALTER TABLE "Branch" ADD PRIMARY KEY ("stepId");',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
test('remove/add pk #2', async (t) => {
	const Step = pgTable('Step', {
		id: bigint({ mode: 'number' }).primaryKey(),
	});
	const schema1 = {
		Step1: Step,
		Branch: pgTable('Branch', {
			id: bigint({ mode: 'number' }).primaryKey(),
			stepId: bigint({ mode: 'number' }).references(() => Step.id, { onDelete: 'cascade' }),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const schema2 = {
		Step,
		Branch: pgTable('Branch', {
			stepId: bigint({ mode: 'number' }).references(() => Step.id, { onDelete: 'cascade' }),
			stepId2: bigint({ mode: 'number' }).primaryKey(),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2 = [
		'ALTER TABLE "Branch" ADD COLUMN "stepId2" bigint;',
		'ALTER TABLE "Branch" DROP COLUMN "id";',
		'ALTER TABLE "Branch" ADD PRIMARY KEY ("stepId2");',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('alter pk from single to composite with column deletion', async (t) => {
	const schema1 = pgTable('users', {
		id: bigint({ mode: 'number' }).primaryKey(),
		age: integer(),
		name: varchar(),
	});

	const { next: n1 } = await diff({}, { schema1 }, []);
	await push({ db, to: { schema1 } });

	const schema2 = pgTable('users', {
		age: integer(),
		name: varchar(),
	}, (t) => [primaryKey({ columns: [t.age, t.name] })]);

	const { sqlStatements: st2 } = await diff(n1, { schema2 }, []);
	const { sqlStatements: pst2 } = await push({ db, to: { schema2 } });

	const expectedSt2 = [
		'ALTER TABLE "users" DROP COLUMN "id";',
		'ALTER TABLE "users" ADD PRIMARY KEY ("age","name");',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
test('alter pk from composite to single with column deletion', async (t) => {
	const schema1 = pgTable('users', {
		id: bigint({ mode: 'number' }),
		age: integer(),
		name: varchar(),
	}, (t) => [primaryKey({ columns: [t.age, t.name] })]);

	const { next: n1 } = await diff({}, { schema1 }, []);
	await push({ db, to: { schema1 } });

	const schema2 = pgTable('users', {
		id: bigint({ mode: 'number' }).primaryKey(),
		age: integer(),
	});

	const { sqlStatements: st2 } = await diff(n1, { schema2 }, []);
	const { sqlStatements: pst2 } = await push({ db, to: { schema2 } });

	const expectedSt2 = [
		'ALTER TABLE "users" DROP COLUMN "name";',
		'ALTER TABLE "users" ADD PRIMARY KEY ("id");',
		'ALTER TABLE "users" ALTER COLUMN "age" DROP NOT NULL;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
test('alter pk from composite to composite with column deletion', async (t) => {
	const schema1 = pgTable('users', {
		id: bigint({ mode: 'number' }),
		age: integer(),
		name: varchar(),
	}, (t) => [primaryKey({ columns: [t.age, t.name] })]);

	const { next: n1 } = await diff({}, { schema1 }, []);
	await push({ db, to: { schema1 } });

	const schema2 = pgTable('users', {
		id: bigint({ mode: 'number' }),
		name: varchar(),
	}, (t) => [primaryKey({ columns: [t.id, t.name] })]);

	const { sqlStatements: st2 } = await diff(n1, { schema2 }, []);
	const { sqlStatements: pst2 } = await push({ db, to: { schema2 } });

	const expectedSt2 = [
		'ALTER TABLE "users" DROP COLUMN "age";',
		'ALTER TABLE "users" ADD PRIMARY KEY ("id","name");',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
test('alter pk from single to single with column creation', async (t) => {
	const schema1 = pgTable('users', {
		id: bigint({ mode: 'number' }).primaryKey(),
		age: integer(),
	});

	const { next: n1 } = await diff({}, { schema1 }, []);
	await push({ db, to: { schema1 } });

	const schema2 = pgTable('users', {
		id: bigint({ mode: 'number' }),
		age: integer(),
		name: varchar().primaryKey(),
	});

	const { sqlStatements: st2 } = await diff(n1, { schema2 }, []);
	const { sqlStatements: pst2 } = await push({ db, to: { schema2 } });

	const expectedSt2 = [
		'ALTER TABLE "users" ADD COLUMN "name" varchar;',
		'ALTER TABLE "users" DROP CONSTRAINT "users_pkey";',
		'ALTER TABLE "users" ADD PRIMARY KEY ("name");',
		'ALTER TABLE "users" ALTER COLUMN "id" DROP NOT NULL;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
test('alter pk from single to composite with column creation', async (t) => {
	const schema1 = pgTable('users', {
		id: bigint({ mode: 'number' }).primaryKey(),
		age: integer(),
	});

	const { next: n1 } = await diff({}, { schema1 }, []);
	await push({ db, to: { schema1 } });

	const schema2 = pgTable('users', {
		id: bigint({ mode: 'number' }),
		age: integer(),
		name: varchar(),
	}, (t) => [primaryKey({ columns: [t.id, t.name] })]);

	const { sqlStatements: st2 } = await diff(n1, { schema2 }, []);
	const { sqlStatements: pst2 } = await push({ db, to: { schema2 } });

	const expectedSt2 = [
		'ALTER TABLE "users" ADD COLUMN "name" varchar;',
		'ALTER TABLE "users" DROP CONSTRAINT "users_pkey";',
		'ALTER TABLE "users" ADD PRIMARY KEY ("id","name");',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
test('alter pk from composite to composite with column creation', async (t) => {
	const schema1 = pgTable('users', {
		id: bigint({ mode: 'number' }),
		age: integer(),
	}, (t) => [primaryKey({ columns: [t.id, t.age] })]);

	const { next: n1 } = await diff({}, { schema1 }, []);
	await push({ db, to: { schema1 } });

	const schema2 = pgTable('users', {
		id: bigint({ mode: 'number' }),
		age: integer(),
		name: varchar(),
	}, (t) => [primaryKey({ columns: [t.id, t.name] })]);

	const { sqlStatements: st2 } = await diff(n1, { schema2 }, []);
	const { sqlStatements: pst2 } = await push({ db, to: { schema2 } });

	const expectedSt2 = [
		'ALTER TABLE "users" ADD COLUMN "name" varchar;',
		'ALTER TABLE "users" DROP CONSTRAINT "users_pkey";',
		'ALTER TABLE "users" ADD PRIMARY KEY ("id","name");',
		'ALTER TABLE "users" ALTER COLUMN "age" DROP NOT NULL;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3117
test('add column with pk to table where was no pk', async (t) => {
	const schema1 = pgTable('users', {
		id: bigint({ mode: 'number' }),
	});

	const { next: n1 } = await diff({}, { schema1 }, []);
	await push({ db, to: { schema1 } });

	const schema2 = pgTable('users', {
		id: bigint({ mode: 'number' }),
		age: bigint({ mode: 'number' }).primaryKey(),
	});

	const { sqlStatements: st2 } = await diff(n1, { schema2 }, []);
	const { sqlStatements: pst2 } = await push({ db, to: { schema2 } });

	const expectedSt2 = [
		`ALTER TABLE "users" ADD COLUMN "age" bigint;`,
		`ALTER TABLE "users" ADD PRIMARY KEY ("age");`,
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/1144#issuecomment-1960807398
test('rename table with composite pk', async () => {
	const users = pgTable('users', {
		id: text('id').primaryKey(),
		fullName: text('full_name'),
		email: text('email').unique().notNull(),
		phone: text('phone'),
		hashedPassword: text('hashed_password'),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
	});

	const session = pgTable('session', {
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		expiresAt: timestamp('expires_at', {
			withTimezone: true,
			mode: 'date',
		}).notNull(),
	});

	const oauthAccount = pgTable(
		'oauth_account',
		{
			providerId: text('provider_id').notNull(),
			providerUserId: text('provider_user_id').notNull(),
			userId: text('user_id')
				.notNull()
				.references(() => users.id),
			createdAt: timestamp('created_at', {
				withTimezone: true,
				mode: 'date',
			})
				.notNull()
				.defaultNow(),
		},
		(table) => {
			return {
				pk: primaryKey({ columns: [table.providerId, table.userId] }),
			};
		},
	);

	const schema1 = { oauthAccount, session, users };

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const user = pgTable('users', {
		id: text('id').primaryKey(),
		fullName: text('full_name'),
		email: text('email').unique().notNull(),
		phone: text('phone'),
		hashedPassword: text('hashed_password'),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
	});

	const session2 = pgTable('sessions', {
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		expiresAt: timestamp('expires_at', {
			withTimezone: true,
			mode: 'date',
		}).notNull(),
	});

	const oauthAccount2 = pgTable(
		'oauth_accounts',
		{
			providerId: text('provider_id').notNull(),
			providerUserId: text('provider_user_id').notNull(),
			userId: text('user_id')
				.notNull()
				.references(() => user.id),
			createdAt: timestamp('created_at', {
				withTimezone: true,
				mode: 'date',
			})
				.notNull()
				.defaultNow(),
		},
		(table) => [primaryKey({ columns: [table.providerId, table.userId] })],
	);

	const schema2 = { user, session2, oauthAccount2 };

	const { sqlStatements: st2 } = await diff(n1, schema2, [
		'public.oauth_account->public.oauth_accounts',
		'public.session->public.sessions',
	]);
	const { sqlStatements: pst2 } = await push({
		db,
		to: schema2,
		renames: ['public.oauth_account->public.oauth_accounts', 'public.session->public.sessions'],
	});
	const expectedSt2 = [
		'ALTER TABLE "oauth_account" RENAME TO "oauth_accounts";',
		'ALTER TABLE "session" RENAME TO "sessions";',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4369
test('fk #1', async () => {
	const users = pgTable('users', {
		id: serial().primaryKey(),
	});
	const posts = pgTable('posts', {
		id: serial().primaryKey(),
		authorId: integer().references(() => users.id),
	});

	const to = {
		posts,
		users,
	};

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE \"posts\" (\n\t"id" serial PRIMARY KEY,\n\t"authorId" integer\n);\n`,
		`CREATE TABLE "users" (\n\t"id" serial PRIMARY KEY\n);\n`,
		`ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_users_id_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id");`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// exactly 63 symbols fkey, fkey name explicit
test('fk #2', async () => {
	const users = pgTable('123456789_123456789_users', {
		id: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE "123456789_123456789_users" (\n\t"id" serial PRIMARY KEY,\n\t"id2" integer\n);\n`,
		'ALTER TABLE "123456789_123456789_users" ADD CONSTRAINT "123456789_123456789_users_id2_123456789_123456789_users_id_fkey" FOREIGN KEY ("id2") REFERENCES "123456789_123456789_users"("id");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// 65 symbols fkey, fkey = table_hash_fkey
test('fk #3', async () => {
	const users = pgTable('1234567890_1234567890_users', {
		id: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE "1234567890_1234567890_users" (\n\t"id" serial PRIMARY KEY,\n\t"id2" integer\n);\n`,
		'ALTER TABLE "1234567890_1234567890_users" ADD CONSTRAINT "1234567890_1234567890_users_2Ge3281eRCJ5_fkey" FOREIGN KEY ("id2") REFERENCES "1234567890_1234567890_users"("id");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// >=45 length table name, fkey = hash_fkey
test('fk #4', async () => {
	const users = pgTable('1234567890_1234567890_1234567890_123456_users', {
		id: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE "1234567890_1234567890_1234567890_123456_users" (\n\t"id" serial PRIMARY KEY,\n\t"id2" integer\n);\n`,
		'ALTER TABLE "1234567890_1234567890_1234567890_123456_users" ADD CONSTRAINT "ydU6odH887YL_fkey" FOREIGN KEY ("id2") REFERENCES "1234567890_1234567890_1234567890_123456_users"("id");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #5', async () => {
	const users = pgTable('users', {
		id: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE "users" (\n\t"id" serial PRIMARY KEY,\n\t"id2" integer\n);\n`,
		'ALTER TABLE "users" ADD CONSTRAINT "users_id2_users_id_fkey" FOREIGN KEY ("id2") REFERENCES "users"("id");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #6', async () => {
	const users = pgTable('users', {
		id: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id),
	});

	const users2 = pgTable('users2', {
		id: serial('id3').primaryKey(),
		id2: integer().references((): AnyPgColumn => users2.id),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['public.users->public.users2', 'public.users2.id->public.users2.id3'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" RENAME COLUMN "id" TO "id3";',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #7', async () => {
	const users = pgTable('users', {
		id1: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id1),
	});

	const users2 = pgTable('users', {
		id1: serial().primaryKey(),
		id2: integer(),
	}, (t) => [foreignKey({ name: 'id2_id1_fk', columns: [t.id2], foreignColumns: [t.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const renames = ['public.users.users_id2_users_id1_fkey->public.users.id2_id1_fk'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE "users" RENAME CONSTRAINT "users_id2_users_id1_fkey" TO "id2_id1_fk";',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #8', async () => {
	const users = pgTable('users', {
		id1: serial().primaryKey(),
		id2: integer().unique(),
		id3: integer().references((): AnyPgColumn => users.id1),
	});

	const users2 = pgTable('users', {
		id1: serial().primaryKey(),
		id2: integer().unique(),
		id3: integer().references((): AnyPgColumn => users.id2),
	});

	const from = { users };
	const to = { users: users2 };

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		'ALTER TABLE "users" DROP CONSTRAINT "users_id3_users_id1_fkey";',
		'ALTER TABLE "users" ADD CONSTRAINT "users_id3_users_id2_fkey" FOREIGN KEY ("id3") REFERENCES "users"("id2");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #9', async () => {
	const users = pgTable('users', {
		id1: serial().primaryKey(),
		id2: integer().unique(),
		id3: integer(),
	}, (t) => [foreignKey({ name: 'fk1', columns: [t.id3], foreignColumns: [t.id1] })]);

	const users2 = pgTable('users', {
		id1: serial().primaryKey(),
		id2: integer().unique(),
		id3: integer(),
	}, (t) => [foreignKey({ name: 'fk1', columns: [t.id3], foreignColumns: [t.id2] })]);

	const from = { users };
	const to = { users: users2 };

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		'ALTER TABLE "users" DROP CONSTRAINT "fk1", ADD CONSTRAINT "fk1" FOREIGN KEY ("id3") REFERENCES "users"("id2");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #10', async () => {
	const users = pgTable('users', {
		id1: serial().primaryKey(),
	});

	const users2 = pgTable('users2', {
		id1: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users2.id1),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['public.users->public.users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" ADD COLUMN "id2" integer;',
		'ALTER TABLE "users2" ADD CONSTRAINT "users2_id2_users2_id1_fkey" FOREIGN KEY ("id2") REFERENCES "users2"("id1");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #11', async () => {
	const users = pgTable('users', {
		id1: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id1),
	});

	const users2 = pgTable('users2', {
		id1: serial().primaryKey(),
		id2: integer(),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['public.users->public.users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" DROP CONSTRAINT "users_id2_users_id1_fkey";',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk multistep #1', async () => {
	const users = pgTable('users', {
		id: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id),
	});

	const users2 = pgTable('users2', {
		id: serial('id3').primaryKey(),
		id2: integer().references((): AnyPgColumn => users2.id),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"id" serial PRIMARY KEY,\n\t"id2" integer\n);\n',
		'ALTER TABLE "users" ADD CONSTRAINT "users_id2_users_id_fkey" FOREIGN KEY ("id2") REFERENCES "users"("id");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const renames = ['public.users->public.users2', 'public.users2.id->public.users2.id3'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" RENAME COLUMN "id" TO "id3";',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const users3 = pgTable('users2', {
		id: serial('id3').primaryKey(),
		id2: integer(),
	});
	const sch3 = { users: users3 };

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });
	expect(st4).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_id2_users_id_fkey";']);
	expect(pst4).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_id2_users_id_fkey";']);
});

test('fk multistep #2', async () => {
	const users = pgTable('users', {
		id: serial().primaryKey(),
		id2: integer().references((): AnyPgColumn => users.id),
	});

	const users2 = pgTable('users2', {
		id: serial('id3').primaryKey(),
		id2: integer().references((): AnyPgColumn => users2.id),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"id" serial PRIMARY KEY,\n\t"id2" integer\n);\n',
		'ALTER TABLE "users" ADD CONSTRAINT "users_id2_users_id_fkey" FOREIGN KEY ("id2") REFERENCES "users"("id");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, []);
	const { sqlStatements: pst2 } = await push({ db, to: sch2 });

	const e2 = [
		'CREATE TABLE "users2" (\n\t"id3" serial PRIMARY KEY,\n\t"id2" integer\n);\n',
		'DROP TABLE "users";',
		'ALTER TABLE "users2" ADD CONSTRAINT "users2_id2_users2_id3_fkey" FOREIGN KEY ("id2") REFERENCES "users2"("id3");',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);
});

test('fk multistep #3', async () => {
	const users = pgTable('users', {
		id: serial().primaryKey(),
		id2: integer(),
	}, (t) => [
		foreignKey({ name: 'users_id2_id1_fkey', columns: [t.id2], foreignColumns: [t.id] }),
	]);

	const { ddl: ddl1 } = drizzleToDDL({ users });
	const { ddl: ddl2 } = drizzleToDDL({ users });
	ddl2.tables.update({
		set: { name: 'users2' },
		where: { name: 'users' },
	});

	const { sqlStatements: st1 } = await diff(ddl1, ddl2, ['public.users->public.users2']);
	expect(st1).toStrictEqual(['ALTER TABLE "users" RENAME TO "users2";']);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4456#issuecomment-3076042688
test('fk multistep #4', async () => {
	const foo = pgTable('foo', {
		id: integer().primaryKey(),
	});

	const bar = pgTable('bar', {
		id: integer().primaryKey(),
		fooId: integer().references(() => foo.id),
	});

	const schema1 = { foo, bar };

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE "foo" (\n\t"id" integer PRIMARY KEY\n);\n',
		'CREATE TABLE "bar" (\n\t"id" integer PRIMARY KEY,\n\t"fooId" integer\n);\n',
		'ALTER TABLE "bar" ADD CONSTRAINT "bar_fooId_foo_id_fkey" FOREIGN KEY ("fooId") REFERENCES "foo"("id");',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		bar: pgTable('bar', {
			id: integer().primaryKey(),
			fooId: integer(),
		}),
	};
	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'ALTER TABLE "bar" DROP CONSTRAINT "bar_fooId_foo_id_fkey";',
		'DROP TABLE "foo";',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('unique multistep #3', async () => {
	await db.query(`CREATE TABLE "users" ("id" integer CONSTRAINT "id_uniq" UNIQUE);`);
	const interim = await fromDatabase(db);
	const { ddl: ddl1 } = interimToDDL(interim);
	const { ddl: ddl2 } = interimToDDL(interim);

	ddl2.tables.update({
		set: { name: 'users2' },
		where: { name: 'users' },
	});

	const { sqlStatements: st1 } = await diff(ddl1, ddl2, ['public.users->public.users2']);
	expect(st1).toStrictEqual(['ALTER TABLE "users" RENAME TO "users2";']);
});

test('constraints order', async () => {
	const users = pgTable('users', {
		col1: text(),
		col2: text(),
	}, (t) => [
		unique().on(t.col1, t.col2),
	]);

	const posts = pgTable('posts', {
		col1: text(),
		col2: text(),
	}, (t) => [
		foreignKey({ columns: [t.col1, t.col2], foreignColumns: [users.col1, users.col2] }),
	]);

	const to = {
		users,
		posts,
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });
});

// https://github.com/drizzle-team/drizzle-orm/issues/3260
test('constraints order #2', async () => {
	const schema1 = {
		table1: pgTable('table1', {
			col1: text(),
			col2: text(),
			col3: text(),
		}),
		table2: pgTable('table2', {
			col1: text(),
		}),
		table3: pgTable('table3', {
			col1: text(),
			col2: text(),
			col3: text(),
			col4: text(),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const table1 = pgTable('table1', {
		col1: text().unique(),
		col2: text(),
		col3: text(),
	}, (t) => [
		unique().on(t.col2, t.col3),
	]);

	const table2 = pgTable('table2', {
		col1: text(),
	}, (t) => [
		uniqueIndex().on(t.col1),
	]);

	const schema2 = {
		table1,
		table2,
		table3: pgTable('table3', {
			col1: text().references(() => table1.col1),
			col2: text(),
			col3: text(),
			col4: text().references(() => table2.col1),
		}, (t) => [
			foreignKey({ columns: [t.col2, t.col3], foreignColumns: [table1.col2, table1.col3] }),
		]),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2 = [
		'ALTER TABLE "table1" ADD CONSTRAINT "table1_col2_col3_unique" UNIQUE("col2","col3");',
		'ALTER TABLE "table1" ADD CONSTRAINT "table1_col1_key" UNIQUE("col1");',
		'CREATE UNIQUE INDEX "table2_col1_index" ON "table2" ("col1");',
		'ALTER TABLE "table3" ADD CONSTRAINT "table3_col1_table1_col1_fkey" FOREIGN KEY ("col1") REFERENCES "table1"("col1");',
		'ALTER TABLE "table3" ADD CONSTRAINT "table3_col4_table2_col1_fkey" FOREIGN KEY ("col4") REFERENCES "table2"("col1");',
		'ALTER TABLE "table3" ADD CONSTRAINT "table3_col2_col3_table1_col2_col3_fkey" FOREIGN KEY ("col2","col3") REFERENCES "table1"("col2","col3");',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('generated + fk', async (t) => {
	const table1 = pgTable(
		'table_with_gen',
		{
			column1: timestamp('column1'),
			column2: timestamp('column2'),
			bool: boolean('bool')
				.generatedAlwaysAs(
					(): SQL => isNull(table1.column1),
				).unique()
				.notNull(),
		},
	);
	const table = pgTable('table', { bool: boolean().references(() => table1.bool) });

	const schema1 = { tableWithGen: table1, table };

	const table2 = pgTable(
		'table_with_gen',
		{
			column1: timestamp('column1'),
			column2: timestamp('column2'),
			bool: boolean('bool')
				.generatedAlwaysAs(
					(): SQL => isNull(table1.column2),
				).unique()
				.notNull(),
		},
	);
	const schema2 = { tableWithGen: table2, table };

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'ALTER TABLE "table" DROP CONSTRAINT "table_bool_table_with_gen_bool_fkey";',
		`ALTER TABLE \"table_with_gen\" DROP COLUMN \"bool\";`,
		`ALTER TABLE \"table_with_gen\" ADD COLUMN \"bool\" boolean GENERATED ALWAYS AS (("table_with_gen"."column2" is null)) STORED;`,
		'ALTER TABLE "table_with_gen" ADD CONSTRAINT "table_with_gen_bool_key" UNIQUE("bool");',
		'ALTER TABLE "table" ADD CONSTRAINT "table_bool_table_with_gen_bool_fkey" FOREIGN KEY ("bool") REFERENCES "table_with_gen"("bool");',
	]);
	// push is not triggered on generated change
	expect(pst).toStrictEqual([]);
});
test('generated + unique', async (t) => {
	const table1 = pgTable(
		'table',
		{
			uid: uuid('uid').notNull(),
			column1: timestamp('column1'),
			column2: timestamp('column2'),
			bool: boolean('bool')
				.generatedAlwaysAs(
					(): SQL => and(isNull(table1.column1), isNull(table1.column2))!,
				).unique()
				.notNull(),
		},
	);
	const schema1 = { table: table1 };

	const table2 = pgTable(
		'table',
		{
			uid: uuid('uid').notNull(),
			column1: timestamp('column1'),
			column3: timestamp('column3'),
			bool: boolean('bool')
				.generatedAlwaysAs(
					(): SQL => and(isNull(table2.column1), isNull(table2.column3))!,
				).unique()
				.notNull(),
		},
	);
	const schema2 = { table: table2 };

	const renames = ['public.table.column2->public.table.column3'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	expect(st).toStrictEqual([
		`ALTER TABLE \"table\" RENAME COLUMN \"column2\" TO \"column3\";`,
		`ALTER TABLE \"table\" DROP COLUMN \"bool\";`,
		`ALTER TABLE \"table\" ADD COLUMN \"bool\" boolean GENERATED ALWAYS AS (((\"table\".\"column1\" is null) and (\"table\".\"column3\" is null))) STORED;`,
		'ALTER TABLE "table" ADD CONSTRAINT "table_bool_key" UNIQUE("bool");',
	]);
	// push is not triggered on generated change
	expect(pst).toStrictEqual([
		`ALTER TABLE \"table\" RENAME COLUMN \"column2\" TO \"column3\";`,
	]);
});
test('generated + pk', async (t) => {
	const table1 = pgTable(
		'table',
		{
			uid: uuid('uid').notNull(),
			column1: timestamp('column1'),
			column2: timestamp('column2'),
			bool: boolean('bool')
				.generatedAlwaysAs(
					(): SQL => and(isNull(table1.column1), isNull(table1.column2))!,
				).primaryKey()
				.notNull(),
		},
	);
	const schema1 = { table: table1 };

	const table2 = pgTable(
		'table',
		{
			uid: uuid('uid').notNull(),
			column1: timestamp('column1'),
			column3: timestamp('column3'),
			bool: boolean('bool')
				.generatedAlwaysAs(
					(): SQL => and(isNull(table2.column1), isNull(table2.column3))!,
				).primaryKey()
				.notNull(),
		},
	);
	const schema2 = { table: table2 };

	const renames = ['public.table.column2->public.table.column3'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	expect(st).toStrictEqual([
		`ALTER TABLE \"table\" RENAME COLUMN \"column2\" TO \"column3\";`,
		`ALTER TABLE \"table\" DROP COLUMN \"bool\";`,
		`ALTER TABLE \"table\" ADD COLUMN \"bool\" boolean PRIMARY KEY GENERATED ALWAYS AS (((\"table\".\"column1\" is null) and (\"table\".\"column3\" is null))) STORED;`,
	]);
	// push is not triggered on generated change
	expect(pst).toStrictEqual([
		`ALTER TABLE \"table\" RENAME COLUMN \"column2\" TO \"column3\";`,
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4456
test('drop column with pk and add pk to another column #1', async () => {
	const schema1 = {
		authors: pgTable('authors', {
			publicationId: varchar('publication_id', { length: 64 }),
			authorID: varchar('author_id', { length: 10 }),
		}, (table) => [
			primaryKey({ columns: [table.publicationId, table.authorID] }),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE "authors" (\n\t"publication_id" varchar(64),\n\t"author_id" varchar(10),'
		+ '\n\tCONSTRAINT "authors_pkey" PRIMARY KEY("publication_id","author_id")\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		authors: pgTable('authors', {
			publicationId: varchar('publication_id', { length: 64 }),
			authorID: varchar('author_id', { length: 10 }),
			orcidId: varchar('orcid_id', { length: 64 }),
		}, (table) => [
			primaryKey({ columns: [table.publicationId, table.authorID, table.orcidId] }),
		]),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE "authors" ADD COLUMN "orcid_id" varchar(64);',
		'ALTER TABLE "authors" DROP CONSTRAINT "authors_pkey";',
		'ALTER TABLE "authors" ADD PRIMARY KEY ("publication_id","author_id","orcid_id");',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3280
test('fk name is too long', async () => {
	const table1 = pgTable(
		'table1_loooooong',
		{
			column1: integer('column1_looooong').primaryKey(),
		},
	);
	const table2 = pgTable(
		'table2_loooooong',
		{
			column1: integer('column1_looooong').references(() => table1.column1).notNull(),
		},
	);
	const to = { table1, table2 };

	const { sqlStatements: st, next: n } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });
	const expectedSt: string[] = [
		'CREATE TABLE "table1_loooooong" (\n\t"column1_looooong" integer PRIMARY KEY\n);\n',
		'CREATE TABLE "table2_loooooong" (\n\t"column1_looooong" integer NOT NULL\n);\n',
		'ALTER TABLE "table2_loooooong" ADD CONSTRAINT "table2_loooooong_KObGFnvgHDVg_fkey" FOREIGN KEY ("column1_looooong") REFERENCES "table1_loooooong"("column1_looooong");',
	];

	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);

	const { sqlStatements: st1 } = await diff(n, to, []);
	const { sqlStatements: pst1 } = await push({ db, to });

	const expectedSt1: string[] = [];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3713
test('enums in check', async () => {
	enum unit {
		kg = 'kg',
		lb = 'lb',
	}
	const to = {
		table: pgTable('table', {
			unit: text().$defaultFn(() => unit.kg).$type<unit>(),
		}, (t) => [
			check('unit_valid', sql`${t.unit} in (${unit.kg}, ${unit.lb})`),
		]),
	};

	const res1 = await push({ db, to });
	const res2 = await push({ db, to });
	expect(res1.sqlStatements).toStrictEqual([
		'CREATE TABLE "table" (\n\t"unit" text,\n\tCONSTRAINT "unit_valid" CHECK ("unit" in (\'kg\', \'lb\'))\n);\n',
	]);
	expect(res2.sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3844
// https://github.com/drizzle-team/drizzle-orm/issues/3103
test('composite pk multistep #2', async () => {
	const userAsyncTasks = pgTable('userAsyncTask', {
		userId: text('userId').notNull(),
		identifier: text('identifier').notNull(),
		type: text('type').notNull(),
	}, (t) => [
		primaryKey({ columns: [t.identifier, t.userId, t.type] }),
	]);
	const schema = { userAsyncTasks };

	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4471
test('composite pk multistep #3', async () => {
	const firstToSecondTable = pgTable(
		'firstToSecond',
		{
			firstId: integer('firstId'),
			secondId: integer('secondId'),
		},
		(table) => [primaryKey({ columns: [table.firstId, table.secondId] })],
	);

	const schema = { firstToSecondTable };

	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});
