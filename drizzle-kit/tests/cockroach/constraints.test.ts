import { sql } from 'drizzle-orm';
import {
	AnyCockroachColumn,
	bigint,
	cockroachTable,
	foreignKey,
	index,
	int4,
	primaryKey,
	text,
	unique,
	varchar,
} from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('unique #1', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
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
		'CREATE UNIQUE INDEX "users_name_key" ON "users" ("name");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #2', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
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
		'CREATE UNIQUE INDEX "unique_name" ON "users" ("name");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #3', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
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
		'CREATE UNIQUE INDEX "unique_name" ON "users" ("name");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #6', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
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
		'CREATE UNIQUE INDEX "unique_name" ON "users" ("name");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #7', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
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
		'CREATE UNIQUE INDEX "unique_name" ON "users" ("name");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #8', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: cockroachTable('users', {
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
		`DROP INDEX "unique_name" CASCADE;`,
		'CREATE UNIQUE INDEX "unique_name2" ON "users" ("name");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #9', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: cockroachTable('users', {
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
		`ALTER INDEX "unique_name" RENAME TO "unique_name2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #10', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
			email: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: cockroachTable('users', {
			name: text(),
			email2: text(),
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
		`ALTER INDEX "unique_name" RENAME TO "unique_name2";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #11', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
			email: text(),
		}, (t) => [
			unique('unique_name').on(t.name),
			unique('unique_email').on(t.email),
		]),
	};
	const to = {
		users: cockroachTable('users', {
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
		'ALTER INDEX "unique_name" RENAME TO "unique_name2";',
		`DROP INDEX "unique_email" CASCADE;`,
		`CREATE UNIQUE INDEX "unique_email2" ON "users" ("email");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('unique #12', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
			email: text().unique(),
		}),
	};
	const to = {
		users: cockroachTable('users2', {
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

test.concurrent('unique #13', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text(),
			email: text().unique(),
		}),
	};
	const sch2 = {
		users: cockroachTable('users2', {
			name: text(),
			email2: text().unique('users_email_key'),
		}),
	};

	const sch3 = {
		users: cockroachTable('users2', {
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
		'DROP INDEX "users_email_key" CASCADE;',
	];
	expect(st2).toStrictEqual(st20);
	expect(pst2).toStrictEqual(st20);
});

test.concurrent('unique multistep #1', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = ['CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n'];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e3 = ['DROP INDEX "users_name_key" CASCADE;'];

	expect(pst4).toStrictEqual(e3);
	expect(st4).toStrictEqual(e3);
});

test.concurrent('unique multistep #2', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });
	expect(st1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n',
	]);

	const sch2 = {
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
			name: text('name2'),
		}, (t) => [unique().on(t.name)]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });
	expect(st4).toStrictEqual([]);
	expect(pst4).toStrictEqual([]);

	const sch4 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });
	expect(st5).toStrictEqual(['DROP INDEX "users_name_key" CASCADE;']);
	expect(pst5).toStrictEqual(['DROP INDEX "users_name_key" CASCADE;']);
});

test.concurrent('unique multistep #3', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n',
	]);

	const sch2 = {
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
			name: text('name2'),
		}, (t) => [unique('name_unique').on(t.name)]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e4 = [
		'DROP INDEX "users_name_key" CASCADE;',
		'CREATE UNIQUE INDEX "name_unique" ON "users2" ("name2");',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });
	expect(st5).toStrictEqual(['DROP INDEX "name_unique" CASCADE;']);
	expect(pst5).toStrictEqual(['DROP INDEX "name_unique" CASCADE;']);
});

test.concurrent('unique multistep #4', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });
	expect(st1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n',
	]);

	const sch2 = {
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
			name: text('name2'),
		}, (t) => [unique('name_unique').on(t.name)]),
	};

	const renames2 = ['public.users2.users_name_key->public.users2.name_unique'];
	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, renames2);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, renames: renames2 });

	expect(st4).toStrictEqual(['ALTER INDEX "users_name_key" RENAME TO "name_unique";']);
	expect(pst4).toStrictEqual(['ALTER INDEX "users_name_key" RENAME TO "name_unique";']);

	const sch4 = {
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });
	expect(st5).toStrictEqual(['DROP INDEX "name_unique" CASCADE;']);
	expect(pst5).toStrictEqual(['DROP INDEX "name_unique" CASCADE;']);
});

test.concurrent('index multistep #1', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text(),
		}, (t) => [index().on(t.name)]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"name" string\n);\n',
		'CREATE INDEX "users_name_index" ON "users" ("name");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	expect(st4).toStrictEqual(['DROP INDEX "users_name_index";']);
	expect(pst4).toStrictEqual(['DROP INDEX "users_name_index";']);
});

test.concurrent('index multistep #2', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text(),
		}, (t) => [index().on(t.name)]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"name" string\n);\n',
		'CREATE INDEX "users_name_index" ON "users" ("name");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch4, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch4 });
	expect(st4).toStrictEqual(['DROP INDEX "name2_idx";']);
	expect(pst4).toStrictEqual(['DROP INDEX "name2_idx";']);
});

test.concurrent('index multistep #3', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text(),
		}, (t) => [index().on(t.name)]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"name" string\n);\n',
		'CREATE INDEX "users_name_index" ON "users" ("name");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch4, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch4 });
	expect(st4).toStrictEqual(['DROP INDEX "name2_idx";']);
	expect(pst4).toStrictEqual(['DROP INDEX "name2_idx";']);
});

test.concurrent('index multistep #3', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text(),
		}, (t) => [index().on(t.name)]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"name" string\n);\n',
		'CREATE INDEX "users_name_index" ON "users" ("name");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
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
		users: cockroachTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch4, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch4 });

	expect(st4).toStrictEqual(['DROP INDEX "name2_idx";']);
	expect(pst4).toStrictEqual(['DROP INDEX "name2_idx";']);
});

test.concurrent('pk #1', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text().notNull(),
		}),
	};

	const to = {
		users: cockroachTable('users', {
			name: text().notNull().primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(st).toStrictEqual(['ALTER TABLE "users" ADD PRIMARY KEY ("name");']);
	expect(pst).toStrictEqual(['ALTER TABLE "users" ADD PRIMARY KEY ("name");']);
});

test.concurrent('pk #2', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text().notNull().primaryKey(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			name: text().notNull().primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test.concurrent('pk #3', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text().notNull().primaryKey(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			name: text().notNull(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test.concurrent('pk #4', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text().notNull(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: cockroachTable('users', {
			name: text().notNull().primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test.concurrent('pk multistep #1', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().primaryKey(),
			id: int4().notNull(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY,\n\t"id" int4 NOT NULL\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY,\n\t"id" int4 NOT NULL\n);\n']);

	const sch2 = {
		users: cockroachTable('users2', {
			name: text('name2').primaryKey(),
			id: int4().notNull(),
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
			id: int4().notNull().primaryKey(),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const st04 = [
		'ALTER TABLE "users2" DROP CONSTRAINT "users_pkey", ADD CONSTRAINT "users2_pkey" PRIMARY KEY("id");',
		'ALTER TABLE "users2" ALTER COLUMN "name2" DROP NOT NULL;',
	];
	expect(st4).toStrictEqual(st04);
	expect(pst4).toStrictEqual(st04);
});

test.concurrent('pk multistep #2', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().primaryKey().notNull(),
			id: int4().notNull(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY,\n\t"id" int4 NOT NULL\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY,\n\t"id" int4 NOT NULL\n);\n']);

	const sch2 = {
		users: cockroachTable('users2', {
			name: text('name2').notNull(),
			id: int4().notNull(),
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
			name: text('name2').notNull(),
			id: int4().notNull(),
		}, (t) => [primaryKey({ name: 'users2_pk', columns: [t.name] })]),
	};

	const renames2 = ['public.users2.users_pkey->public.users2.users2_pk'];
	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, renames2);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, renames: renames2 });

	expect(st4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_pkey" TO "users2_pk";']);
	expect(pst4).toStrictEqual(['ALTER TABLE "users2" RENAME CONSTRAINT "users_pkey" TO "users2_pk";']);

	const sch4 = {
		users: cockroachTable('users2', {
			name: text('name2').notNull(),
			id: int4().notNull().primaryKey(),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });

	expect(st5).toStrictEqual([
		'ALTER TABLE "users2" DROP CONSTRAINT "users2_pk", ADD CONSTRAINT "users2_pkey" PRIMARY KEY("id");',
	]);
	expect(pst5).toStrictEqual([
		'ALTER TABLE "users2" DROP CONSTRAINT "users2_pk", ADD CONSTRAINT "users2_pkey" PRIMARY KEY("id");',
	]);
});

test.concurrent('pk multistep #3', async ({ db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().primaryKey(),
			id: int4(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY,\n\t"id" int4\n);\n']);
	expect(pst1).toStrictEqual(['CREATE TABLE "users" (\n\t"name" string PRIMARY KEY,\n\t"id" int4\n);\n']);

	const sch2 = {
		users: cockroachTable('users2', {
			name: text('name2'),
			id: int4(),
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
			id: int4(),
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
			id: int4().notNull().primaryKey(),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });

	const st05 = [
		'ALTER TABLE "users2" ALTER COLUMN "id" SET NOT NULL;',
		'ALTER TABLE "users2" DROP CONSTRAINT "users2_pk", ADD CONSTRAINT "users2_pkey" PRIMARY KEY("id");',
		'ALTER TABLE "users2" ALTER COLUMN "name2" DROP NOT NULL;',
	];
	expect(st5).toStrictEqual(st05);
	expect(pst5).toStrictEqual(st05);
});

test.concurrent('pk multistep #4', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text(),
		}, (t) => [
			primaryKey({ name: 'users_pk', columns: [t.name] }),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_pk" PRIMARY KEY("name")\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string,\n\tCONSTRAINT "users_pk" PRIMARY KEY("name")\n);\n',
	]);

	const sch2 = {
		users: cockroachTable('users2', {
			name: text(),
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

test.concurrent('pk multistep #5', async ({ dbc: db }) => {
	const sch1 = {
		users: cockroachTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string PRIMARY KEY\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE "users" (\n\t"name" string PRIMARY KEY\n);\n',
	]);

	const sch2 = {
		users: cockroachTable('users2', {
			name: text().primaryKey(),
		}),
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

test.concurrent('fk #1', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id: int4().primaryKey(),
	});
	const posts = cockroachTable('posts', {
		id: int4().primaryKey(),
		authorId: int4().references(() => users.id),
	});

	const to = {
		posts,
		users,
	};

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE \"posts\" (\n\t"id" int4 PRIMARY KEY,\n\t"authorId" int4\n);\n`,
		`CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY\n);\n`,
		`ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_users_id_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id");`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// exactly 63 symbols fkey, fkey name explicit
test.concurrent('fk #2', async ({ dbc: db }) => {
	const users = cockroachTable('123456789_123456789_users', {
		id: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE "123456789_123456789_users" (\n\t"id" int4 PRIMARY KEY,\n\t"id2" int4\n);\n`,
		'ALTER TABLE "123456789_123456789_users" ADD CONSTRAINT "123456789_123456789_users_id2_123456789_123456789_users_id_fkey" FOREIGN KEY ("id2") REFERENCES "123456789_123456789_users"("id");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// 65 symbols fkey, fkey = table_hash_fkey
test.concurrent('fk #3', async ({ dbc: db }) => {
	const users = cockroachTable('1234567890_1234567890_users', {
		id: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE "1234567890_1234567890_users" (\n\t"id" int4 PRIMARY KEY,\n\t"id2" int4\n);\n`,
		'ALTER TABLE "1234567890_1234567890_users" ADD CONSTRAINT "1234567890_1234567890_users_2Ge3281eRCJ5_fkey" FOREIGN KEY ("id2") REFERENCES "1234567890_1234567890_users"("id");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// >=45 length table name, fkey = hash_fkey
test.concurrent('fk #4', async ({ dbc: db }) => {
	const users = cockroachTable('1234567890_1234567890_1234567890_123456_users', {
		id: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE "1234567890_1234567890_1234567890_123456_users" (\n\t"id" int4 PRIMARY KEY,\n\t"id2" int4\n);\n`,
		'ALTER TABLE "1234567890_1234567890_1234567890_123456_users" ADD CONSTRAINT "ydU6odH887YL_fkey" FOREIGN KEY ("id2") REFERENCES "1234567890_1234567890_1234567890_123456_users"("id");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test.concurrent('fk #5', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY,\n\t"id2" int4\n);\n`,
		'ALTER TABLE "users" ADD CONSTRAINT "users_id2_users_id_fkey" FOREIGN KEY ("id2") REFERENCES "users"("id");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test.concurrent('fk #6', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id),
	});

	const users2 = cockroachTable('users2', {
		id: int4('id3').primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users2.id),
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

test.concurrent('fk #7', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id1: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id1),
	});

	const users2 = cockroachTable('users', {
		id1: int4().primaryKey(),
		id2: int4(),
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

test.concurrent('fk #8', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id1: int4().primaryKey(),
		id2: int4().unique(),
		id3: int4().references((): AnyCockroachColumn => users.id1),
	});

	const users2 = cockroachTable('users', {
		id1: int4().primaryKey(),
		id2: int4().unique(),
		id3: int4().references((): AnyCockroachColumn => users.id2),
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

test.concurrent('fk #9', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id1: int4().primaryKey(),
		id2: int4().unique(),
		id3: int4(),
	}, (t) => [foreignKey({ name: 'fk1', columns: [t.id3], foreignColumns: [t.id1] })]);

	const users2 = cockroachTable('users', {
		id1: int4().primaryKey(),
		id2: int4().unique(),
		id3: int4(),
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

test.concurrent('fk #10', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id1: int4().primaryKey(),
	});

	const users2 = cockroachTable('users2', {
		id1: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users2.id1),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['public.users->public.users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER TABLE "users2" ADD COLUMN "id2" int4;',
		'ALTER TABLE "users2" ADD CONSTRAINT "users2_id2_users2_id1_fkey" FOREIGN KEY ("id2") REFERENCES "users2"("id1");',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test.concurrent('fk #11', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id1: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id1),
	});

	const users2 = cockroachTable('users2', {
		id1: int4().primaryKey(),
		id2: int4(),
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

test.concurrent('fk multistep #1', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id),
	});

	const users2 = cockroachTable('users2', {
		id: int4('id3').primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users2.id),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY,\n\t"id2" int4\n);\n',
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

	const users3 = cockroachTable('users2', {
		id: int4('id3').primaryKey(),
		id2: int4(),
	});
	const sch3 = { users: users3 };

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });
	expect(st4).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_id2_users_id_fkey";']);
	expect(pst4).toStrictEqual(['ALTER TABLE "users2" DROP CONSTRAINT "users_id2_users_id_fkey";']);
});

test.concurrent('fk multistep #2', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id: int4().primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users.id),
	});

	const users2 = cockroachTable('users2', {
		id: int4('id3').primaryKey(),
		id2: int4().references((): AnyCockroachColumn => users2.id),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY,\n\t"id2" int4\n);\n',
		'ALTER TABLE "users" ADD CONSTRAINT "users_id2_users_id_fkey" FOREIGN KEY ("id2") REFERENCES "users"("id");',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, []);
	const { sqlStatements: pst2 } = await push({ db, to: sch2 });

	const e2 = [
		'CREATE TABLE "users2" (\n\t"id3" int4 PRIMARY KEY,\n\t"id2" int4\n);\n',
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

// https://github.com/drizzle-team/drizzle-orm/issues/4456#issuecomment-3076042688
test('fk multistep #4', async ({ dbc: db }) => {
	const foo = cockroachTable('foo', {
		id: int4().primaryKey(),
	});

	const bar = cockroachTable('bar', {
		id: int4().primaryKey(),
		fooId: int4().references(() => foo.id),
	});

	const schema1 = { foo, bar };

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE "foo" (\n\t"id" int4 PRIMARY KEY\n);\n',
		'CREATE TABLE "bar" (\n\t"id" int4 PRIMARY KEY,\n\t"fooId" int4\n);\n',
		'ALTER TABLE "bar" ADD CONSTRAINT "bar_fooId_foo_id_fkey" FOREIGN KEY ("fooId") REFERENCES "foo"("id");',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		bar: cockroachTable('bar', {
			id: int4().primaryKey(),
			fooId: int4(),
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

test.concurrent('unique duplicate name', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: varchar({ length: 255 }),
			age: int4(),
		}),
		users2: cockroachTable('users2', {
			name: varchar({ length: 255 }),
			age: int4(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			name: varchar({ length: 255 }),
			age: int4(),
		}, (t) => [unique('test').on(t.name)]),
		users2: cockroachTable('users2', {
			name: varchar({ length: 255 }),
			age: int4(),
		}, (t) => [unique('test').on(t.name)]),
	};

	await push({ db, to: from });

	await expect(diff(from, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

test.concurrent('pk duplicate name', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: varchar({ length: 255 }),
			age: int4(),
		}),
		users2: cockroachTable('users2', {
			name: varchar({ length: 255 }),
			age: int4(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			name: varchar({ length: 255 }),
			age: int4(),
		}, (t) => [primaryKey({ name: 'test', columns: [t.name] })]),
		users2: cockroachTable('users2', {
			name: varchar({ length: 255 }),
			age: int4(),
		}, (t) => [primaryKey({ name: 'test', columns: [t.name] })]),
	};

	await push({ db, to: from });

	await expect(diff(from, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

test.concurrent('fk duplicate name', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		name: varchar({ length: 255 }).primaryKey(),
		age: int4().unique(),
	});
	const from = {
		users,
		users2: cockroachTable('users2', {
			name: varchar({ length: 255 }),
			age: int4(),
		}),
	};
	const to = {
		users,
		users2: cockroachTable(
			'users2',
			{
				name: varchar({ length: 255 }),
				age: int4(),
			},
			(
				t,
			) => [
				foreignKey({ name: 'test', columns: [t.age], foreignColumns: [users.age] }),
				foreignKey({ name: 'test', columns: [t.name], foreignColumns: [users.name] }),
			],
		),
	};

	await push({ db, to: from });

	await expect(diff(from, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

test.concurrent('index duplicate name', async ({ dbc: db }) => {
	const to = {
		users: cockroachTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
			age: int4().unique(),
		}, (t) => [index('test').on(t.age), index('test').on(t.name)]),
	};

	await expect(diff({}, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

test.concurrent('index with no name', async ({ dbc: db }) => {
	const to = {
		users: cockroachTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
			age: int4().unique(),
		}, (t) => [index().on(sql`${t.age}`)]),
	};

	await expect(diff({}, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

test.concurrent('alter pk test #1', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
			id: int4().notNull(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: cockroachTable('users', {
			name: text(),
			id: int4().primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE \"users\" DROP CONSTRAINT \"users_pkey\", ADD CONSTRAINT \"users_pkey\" PRIMARY KEY(\"id\");`,
		'ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;',
	];
	expect(sqlStatements).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('alter pk test #2', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
			id: int4().notNull(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: cockroachTable('users', {
			name: text(),
			id: bigint('id3', { mode: 'number' }).primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, ['public.users.id->public.users.id3']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: ['public.users.id->public.users.id3'],
	});

	const st0 = [
		`ALTER TABLE \"users\" RENAME COLUMN \"id\" TO \"id3\";`,
		'ALTER TABLE "users" ALTER COLUMN "id3" SET DATA TYPE int8;',
		`ALTER TABLE \"users\" DROP CONSTRAINT \"users_pkey\", ADD CONSTRAINT \"users_pkey\" PRIMARY KEY(\"id3\");`,
		'ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;',
	];
	expect(sqlStatements).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('alter pk test #3', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			name: text(),
			id: int4().notNull(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: cockroachTable('users', {
			name: text(),
			id: bigint('id3', { mode: 'number' }).primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "users" ADD COLUMN "id3" int8 NOT NULL;',
		`ALTER TABLE \"users\" DROP CONSTRAINT \"users_pkey\", ADD CONSTRAINT \"users_pkey\" PRIMARY KEY(\"id3\");`,
		'ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;',
		'ALTER TABLE "users" DROP COLUMN "id";',
	];
	expect(sqlStatements).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4456
test('drop column with pk and add pk to another column #1', async ({ dbc: db }) => {
	const schema1 = {
		authors: cockroachTable('authors', {
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
		authors: cockroachTable('authors', {
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
		'ALTER TABLE "authors" ADD COLUMN "orcid_id" varchar(64) NOT NULL;',
		'ALTER TABLE "authors" DROP CONSTRAINT "authors_pkey", ADD CONSTRAINT "authors_pkey" PRIMARY KEY("publication_id","author_id","orcid_id");',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
