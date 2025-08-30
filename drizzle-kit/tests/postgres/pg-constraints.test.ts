import {
	AnyPgColumn,
	foreignKey,
	index,
	integer,
	pgTable,
	primaryKey,
	serial,
	text,
	unique,
} from 'drizzle-orm/pg-core';
import { introspect } from 'src/cli/commands/pull-postgres';
import { EmptyProgressView } from 'src/cli/views';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDatabase } from 'src/ext/studio-postgres';
import { DB } from 'src/utils';
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

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" DROP CONSTRAINT "users_pkey";']);
	expect(pst).toStrictEqual(['ALTER TABLE "users" DROP CONSTRAINT "users_pkey";']);
});

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

	expect(st4).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_pkey";']);
	expect(pst4).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_pkey";']);
});

test('pk multistep #2', async () => {
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

	const renames2 = ['public.users2.users_pkey->public.users2.users2_pk'];
	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, renames2);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, renames: renames2 });

	expect(st4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_pkey" TO "users2_pk";']);
	expect(pst4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_pkey" TO "users2_pk";']);

	const sch4 = {
		users: pgTable('users2', {
			name: text('name2'),
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

	expect(st5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users2_pk";']);
	expect(pst5).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users2_pk";']);
});

test('pk multistep #3', async () => {
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
		'ALTER TABLE "1234567890_1234567890_users" ADD CONSTRAINT "1234567890_1234567890_users_Bvhqr6Z0Skyq_fkey" FOREIGN KEY ("id2") REFERENCES "1234567890_1234567890_users"("id");',
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
		'ALTER TABLE "1234567890_1234567890_1234567890_123456_users" ADD CONSTRAINT "Xi9rVl1SOACO_fkey" FOREIGN KEY ("id2") REFERENCES "1234567890_1234567890_1234567890_123456_users"("id");',
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
