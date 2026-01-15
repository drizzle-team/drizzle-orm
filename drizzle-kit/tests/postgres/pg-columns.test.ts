import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	char,
	cidr,
	customType,
	date,
	doublePrecision,
	geometry,
	inet,
	integer,
	interval,
	json,
	jsonb,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	pgSchema,
	pgTable,
	primaryKey,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, preparePostgisTestDatabase, prepareTestDatabase, push, TestDatabase } from './mocks';

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

test('add columns #1', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = ['ALTER TABLE "users" ADD COLUMN "name" text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #2', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
			email: text('email'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		'ALTER TABLE "users" ADD COLUMN "name" text;',
		'ALTER TABLE "users" ADD COLUMN "email" text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column change name #1', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name1'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [
			'public.users.name->public.users.name1',
		],
	});

	const st0 = ['ALTER TABLE "users" RENAME COLUMN "name" TO "name1";'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column change name #2', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name1'),
			email: text('email'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [
			'public.users.name->public.users.name1',
		],
	});

	const st0 = [
		'ALTER TABLE "users" RENAME COLUMN "name" TO "name1";',
		'ALTER TABLE "users" ADD COLUMN "email" text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// TODO: @AlexBlokh revise: you can't change varchar type to inet using
// ALTER TABLE "table1" ALTER COLUMN "column1" SET DATA TYPE inet;
// https://github.com/drizzle-team/drizzle-orm/issues/4806
test('alter column type to custom type', async (t) => {
	const schema1 = {
		table1: pgTable('table1', {
			column1: varchar({ length: 256 }),
		}),
	};

	const citext = customType<{ data: string }>({
		dataType() {
			return 'text';
		},
	});
	const schema2 = {
		table1: pgTable('table1', {
			column1: citext(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "table1" ALTER COLUMN "column1" SET DATA TYPE text USING "column1"::text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4245
test('alter text type to jsonb type', async () => {
	const schema1 = {
		table1: pgTable('table1', {
			column1: text(),
		}),
	};

	await push({ db, to: schema1 });
	const { next: n1 } = await diff({}, schema1, []);
	await db.query(`insert into table1 values ('{"b":2}');`);

	const schema2 = {
		table1: pgTable('table1', {
			column1: jsonb(),
		}),
	};

	const { sqlStatements: st } = await diff(n1, schema2, []);
	const { sqlStatements: pst, hints } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "table1" ALTER COLUMN "column1" SET DATA TYPE jsonb USING "column1"::jsonb;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(hints).toStrictEqual([]);

	// to be sure that table1 wasn't truncated
	const res = await db.query(`select * from table1;`);
	expect(res[0].column1).toStrictEqual({ b: 2 });
});

// https://github.com/drizzle-team/drizzle-orm/issues/2856
test('alter text type to timestamp type', async () => {
	const schema1 = {
		table1: pgTable('table1', {
			column1: text(),
		}),
	};

	await push({ db, to: schema1 });
	const { next: n1 } = await diff({}, schema1, []);
	await db.query(`insert into table1 values ('2024-01-01 09:00:00.123456');`);

	const schema2 = {
		table1: pgTable('table1', {
			column1: timestamp({ withTimezone: true }),
		}),
	};

	const { sqlStatements: st } = await diff(n1, schema2, []);
	const { sqlStatements: pst, hints } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "table1" ALTER COLUMN "column1" SET DATA TYPE timestamp with time zone USING "column1"::timestamp with time zone;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(hints).toStrictEqual([]);

	// to be sure that table1 wasn't truncated
	const res = await db.query(`select * from table1;`);
	expect(res[0].column1).toBeDefined();
	expect(res[0].column1).not.toBe(null);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2751
test('alter text type to enum type', async () => {
	const schema1 = {
		table1: pgTable('table1', {
			column1: text(),
		}),
	};

	await push({ db, to: schema1 });
	const { next: n1 } = await diff({}, schema1, []);
	await db.query(`insert into table1 values ('admin');`);

	const roles = ['admin', 'participant'] as const;
	const roleEnum = pgEnum('role', roles);
	const schema2 = {
		roleEnum,
		table1: pgTable('table1', {
			column1: roleEnum(),
		}),
	};

	const { sqlStatements: st } = await diff(n1, schema2, []);
	const { sqlStatements: pst, hints } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE TYPE "role" AS ENUM('admin', 'participant');`,
		'ALTER TABLE "table1" ALTER COLUMN "column1" SET DATA TYPE "role" USING "column1"::"role";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(hints).toStrictEqual([]);

	// to be sure that table1 wasn't truncated
	const res = await db.query(`select * from table1;`);
	expect(res[0].column1).toBeDefined();
	expect(res[0].column1).not.toBe(null);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3589
// After discussion it was decided to postpone this feature
test.skipIf(Date.now() < +new Date('2026-01-20'))('alter integer type to text type with fk constraints', async () => {
	const users1 = pgTable('users', {
		id: serial().primaryKey(),
	});

	const schema1 = {
		users1,
		sessions: pgTable('sessions', {
			id: text().primaryKey(),
			userId: integer().notNull().references(() => users1.id),
		}),
		content: pgTable('content', {
			id: text().primaryKey(),
			userId: integer().notNull().references(() => users1.id),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });
	await db.query('insert into "users" values (1);');
	await db.query('insert into "sessions" values (1,1);');
	await db.query('insert into "content" values (1,1);');

	const users2 = pgTable('users', {
		id: text().primaryKey(),
	});
	const schema2 = {
		users2,
		sessions: pgTable('sessions', {
			id: text().primaryKey(),
			userId: text().notNull().references(() => users2.id),
		}),
		content: pgTable('content', {
			id: text().primaryKey(),
			userId: text().notNull().references(() => users2.id),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2 = [
		'ALTER TABLE "sessions" DROP CONSTRAINT "sessions_userId_users_id_fkey";',
		'ALTER TABLE "content" DROP CONSTRAINT "content_userId_users_id_fkey";',
		'ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE text;',
		'ALTER TABLE "sessions" ALTER COLUMN "userId" SET DATA TYPE text;',
		'ALTER TABLE "content" ALTER COLUMN "userId" SET DATA TYPE text;',
		'ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id");',
		'ALTER TABLE "content" ADD CONSTRAINT "content_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id");',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('alter table add composite pk', async (t) => {
	const schema1 = {
		table: pgTable('table', {
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const schema2 = {
		table: pgTable('table', {
			id1: integer('id1'),
			id2: integer('id2'),
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

test('rename table rename column #1', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id'),
		}),
	};

	const schema2 = {
		users: pgTable('users1', {
			id: integer('id1'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'public.users->public.users1',
		'public.users1.id->public.users1.id1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [
			'public.users->public.users1',
			'public.users1.id->public.users1.id1',
		],
	});

	const st0 = [
		'ALTER TABLE "users" RENAME TO "users1";',
		'ALTER TABLE "users1" RENAME COLUMN "id" TO "id1";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('with composite pks #1', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id1: integer('id1'),
			id2: integer('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id1: integer('id1'),
			id2: integer('id2'),
			text: text('text'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = ['ALTER TABLE "users" ADD COLUMN "text" text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('with composite pks #2', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id1: integer('id1'),
			id2: integer('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = ['ALTER TABLE "users" ADD CONSTRAINT "compositePK" PRIMARY KEY("id1","id2");'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('with composite pks #3', async (t) => {
	const schema1 = {
		users: pgTable(
			'users',
			{
				id1: integer('id1'),
				id2: integer('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })],
		),
	};

	const schema2 = {
		users: pgTable('users', {
			id1: integer('id1'),
			id3: integer('id3'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id3], name: 'compositePK' })]),
	};

	const renames = ['public.users.id2->public.users.id3'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0 = ['ALTER TABLE "users" RENAME COLUMN "id2" TO "id3";'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create composite primary key', async () => {
	const schema1 = {};

	const schema2 = {
		table: pgTable('table', {
			col1: integer('col1').notNull(),
			col2: integer('col2').notNull(),
		}, (t) => [primaryKey({
			columns: [t.col1, t.col2],
		})]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE TABLE "table" (\n\t"col1" integer,\n\t"col2" integer,\n\tCONSTRAINT "table_pkey" PRIMARY KEY("col1","col2")\n);\n',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add multiple constraints #1', async (t) => {
	const t1 = pgTable('t1', {
		id: uuid('id').primaryKey().defaultRandom(),
	});

	const t2 = pgTable('t2', {
		id: uuid('id').primaryKey().defaultRandom(),
	});

	const t3 = pgTable('t3', {
		id: uuid('id').primaryKey().defaultRandom(),
	});

	const schema1 = {
		t1,
		t2,
		t3,
		ref1: pgTable('ref1', {
			id1: uuid('id1').references(() => t1.id),
			id2: uuid('id2').references(() => t2.id),
			id3: uuid('id3').references(() => t3.id),
		}),
	};

	const schema2 = {
		t1,
		t2,
		t3,
		ref1: pgTable('ref1', {
			id1: uuid('id1').references(() => t1.id, { onDelete: 'cascade' }),
			id2: uuid('id2').references(() => t2.id, { onDelete: 'set null' }),
			id3: uuid('id3').references(() => t3.id, { onDelete: 'cascade' }),
		}),
	};

	// TODO: remove redundand drop/create create constraint
	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "ref1" DROP CONSTRAINT "ref1_id1_t1_id_fkey", ADD CONSTRAINT "ref1_id1_t1_id_fkey" FOREIGN KEY ("id1") REFERENCES "t1"("id") ON DELETE CASCADE;',
		'ALTER TABLE "ref1" DROP CONSTRAINT "ref1_id2_t2_id_fkey", ADD CONSTRAINT "ref1_id2_t2_id_fkey" FOREIGN KEY ("id2") REFERENCES "t2"("id") ON DELETE SET NULL;',
		'ALTER TABLE "ref1" DROP CONSTRAINT "ref1_id3_t3_id_fkey", ADD CONSTRAINT "ref1_id3_t3_id_fkey" FOREIGN KEY ("id3") REFERENCES "t3"("id") ON DELETE CASCADE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add multiple constraints #2', async (t) => {
	const t1 = pgTable('t1', {
		id1: uuid('id1').unique(),
		id2: uuid('id2').unique(),
		id3: uuid('id3').unique(),
	});

	const schema1 = {
		t1,
		ref1: pgTable('ref1', {
			id1: uuid('id1').references(() => t1.id1),
			id2: uuid('id2').references(() => t1.id2),
			id3: uuid('id3').references(() => t1.id3),
		}),
	};

	const schema2 = {
		t1,
		ref1: pgTable('ref1', {
			id1: uuid('id1').references(() => t1.id1, { onDelete: 'cascade' }),
			id2: uuid('id2').references(() => t1.id2, { onDelete: 'set null' }),
			id3: uuid('id3').references(() => t1.id3, { onDelete: 'cascade' }),
		}),
	};

	// TODO: remove redundand drop/create create constraint
	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		'ALTER TABLE "ref1" DROP CONSTRAINT "ref1_id1_t1_id1_fkey", ADD CONSTRAINT "ref1_id1_t1_id1_fkey" FOREIGN KEY ("id1") REFERENCES "t1"("id1") ON DELETE CASCADE;',
		'ALTER TABLE "ref1" DROP CONSTRAINT "ref1_id2_t1_id2_fkey", ADD CONSTRAINT "ref1_id2_t1_id2_fkey" FOREIGN KEY ("id2") REFERENCES "t1"("id2") ON DELETE SET NULL;',
		'ALTER TABLE "ref1" DROP CONSTRAINT "ref1_id3_t1_id3_fkey", ADD CONSTRAINT "ref1_id3_t1_id3_fkey" FOREIGN KEY ("id3") REFERENCES "t1"("id3") ON DELETE CASCADE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add multiple constraints #3', async (t) => {
	const t1 = pgTable('t1', {
		id1: uuid('id1').unique(),
		id2: uuid('id2').unique(),
		id3: uuid('id3').unique(),
	});

	const schema1 = {
		t1,
		ref1: pgTable('ref1', {
			id: uuid('id').references(() => t1.id1),
		}),
		ref2: pgTable('ref2', {
			id: uuid('id').references(() => t1.id2),
		}),
		ref3: pgTable('ref3', {
			id: uuid('id').references(() => t1.id3),
		}),
	};

	const schema2 = {
		t1,
		ref1: pgTable('ref1', {
			id: uuid('id').references(() => t1.id1, { onDelete: 'cascade' }),
		}),
		ref2: pgTable('ref2', {
			id: uuid('id').references(() => t1.id2, { onDelete: 'set null' }),
		}),
		ref3: pgTable('ref3', {
			id: uuid('id').references(() => t1.id3, { onDelete: 'cascade' }),
		}),
	};

	// TODO: remove redundand drop/create create constraint
	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "ref1" DROP CONSTRAINT "ref1_id_t1_id1_fkey", ADD CONSTRAINT "ref1_id_t1_id1_fkey" FOREIGN KEY ("id") REFERENCES "t1"("id1") ON DELETE CASCADE;',
		'ALTER TABLE "ref2" DROP CONSTRAINT "ref2_id_t1_id2_fkey", ADD CONSTRAINT "ref2_id_t1_id2_fkey" FOREIGN KEY ("id") REFERENCES "t1"("id2") ON DELETE SET NULL;',
		'ALTER TABLE "ref3" DROP CONSTRAINT "ref3_id_t1_id3_fkey", ADD CONSTRAINT "ref3_id_t1_id3_fkey" FOREIGN KEY ("id") REFERENCES "t1"("id3") ON DELETE CASCADE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('varchar and text default values escape single quotes', async () => {
	const schema1 = {
		table: pgTable('table', {
			id: serial('id').primaryKey(),
		}),
	};

	const schema2 = {
		table: pgTable('table', {
			id: serial('id').primaryKey(),
			text: text('text').default("escape's quotes"),
			varchar: varchar('varchar').default("escape's quotes"),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`ALTER TABLE "table" ADD COLUMN "text" text DEFAULT 'escape''s quotes';`,
		`ALTER TABLE "table" ADD COLUMN "varchar" varchar DEFAULT 'escape''s quotes';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns with defaults', async () => {
	const schema1 = {
		table: pgTable('table', {
			id: serial().primaryKey(),
		}),
	};

	const schema2 = {
		table: pgTable('table', {
			id: serial().primaryKey(),
			text1: text().default(''),
			text2: text().default('text'),
			int1: integer().default(10),
			int2: integer().default(0),
			int3: integer().default(-10),
			bool1: boolean().default(true),
			bool2: boolean().default(false),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "table" ADD COLUMN "text1" text DEFAULT \'\';',
		'ALTER TABLE "table" ADD COLUMN "text2" text DEFAULT \'text\';',
		'ALTER TABLE "table" ADD COLUMN "int1" integer DEFAULT 10;',
		'ALTER TABLE "table" ADD COLUMN "int2" integer DEFAULT 0;',
		'ALTER TABLE "table" ADD COLUMN "int3" integer DEFAULT -10;',
		'ALTER TABLE "table" ADD COLUMN "bool1" boolean DEFAULT true;',
		'ALTER TABLE "table" ADD COLUMN "bool2" boolean DEFAULT false;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// TODO: check for created tables, etc
});

test('add array column - empty array default', async () => {
	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([]),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT \'{}\'::integer[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add array column - default', async () => {
	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([1, 2, 3]),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT \'{1,2,3}\'::integer[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add not null to a column', async () => {
	const schema1 = {
		users: pgTable(
			'User',
			{
				id: text('id').primaryKey().notNull(),
				name: text('name'),
				username: text('username'),
				gh_username: text('gh_username'),
				email: text('email'),
				emailVerified: timestamp('emailVerified', {
					precision: 3,
					mode: 'date',
				}),
				image: text('image'),
				createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
					.default(sql`CURRENT_TIMESTAMP`)
					.notNull(),
				updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
					.notNull()
					.$onUpdate(() => new Date()),
			},
			(table) => [uniqueIndex('User_email_key').on(table.email)],
		),
	};

	const schema2 = {
		users: pgTable(
			'User',
			{
				id: text('id').primaryKey().notNull(),
				name: text('name'),
				username: text('username'),
				gh_username: text('gh_username'),
				email: text('email').notNull(),
				emailVerified: timestamp('emailVerified', {
					precision: 3,
					mode: 'date',
				}),
				image: text('image'),
				createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
					.default(sql`CURRENT_TIMESTAMP`)
					.notNull(),
				updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
					.notNull()
					.$onUpdate(() => new Date()),
			},
			(table) => [uniqueIndex('User_email_key').on(table.email)],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;'];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// TODO: revise should I use suggestion func?
	// const { losses, hints } = await suggestions(db, statements);

	expect(hints).toStrictEqual([]);
});

test('add not null to a column with null data. Should rollback', async () => {
	const schema1 = {
		users: pgTable('User', {
			id: text('id').primaryKey(),
			name: text('name'),
			username: text('username'),
			gh_username: text('gh_username'),
			email: text('email'),
			emailVerified: timestamp('emailVerified', { precision: 3, mode: 'date' }),
			image: text('image'),
			createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
			updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' }).notNull().$onUpdate(() => new Date()),
		}, (table) => [uniqueIndex('User_email_key').on(table.email)]),
	};

	const schema2 = {
		users: pgTable('User', {
			id: text('id').primaryKey(),
			name: text('name'),
			username: text('username'),
			gh_username: text('gh_username'),
			email: text('email').notNull(),
			emailVerified: timestamp('emailVerified', { precision: 3, mode: 'date' }),
			image: text('image'),
			createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
			updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' }).notNull().$onUpdate(() => new Date()),
		}, (table) => [uniqueIndex('User_email_key').on(table.email)]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	db.query(`INSERT INTO "User" (id, email, "updatedAt") values ('str', 'email@gmail', '2025-04-29 09:20:39');`);
	const { sqlStatements: pst, hints } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;'];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(hints).toStrictEqual([]);
});

test('add generated column', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
		}),
	};
	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name}`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name") STORED;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add generated constraint to an existing column', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name'),
		}),
	};
	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name}`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name") STORED;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop generated constraint from a column', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema1.users.name}`),
		}),
	};
	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "users" ALTER COLUMN "gen_name" DROP EXPRESSION;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('geometry point with srid', async () => {
	const postgisDb = await preparePostgisTestDatabase();

	try {
		const schema1 = {
			users: pgTable('users', {
				id1: geometry('id1'),
				id2: geometry('id2', { srid: 0 }),
				id3: geometry('id3', { srid: 10 }),
				id4: geometry('id4'),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id1: geometry('id1', { srid: 0 }),
				id2: geometry('id2'),
				id3: geometry('id3', { srid: 12 }),
				id4: geometry('id4'),
			}),
		};

		const { sqlStatements: st } = await diff(schema1, schema2, []);

		await push({
			db: postgisDb.db,
			to: schema1,
			tables: ['users'],
			schemas: ['public'],
		});
		const { sqlStatements: pst } = await push({
			db: postgisDb.db,
			to: schema2,
			tables: ['users'],
			schemas: ['public'],
		});

		const st0: string[] = [
			'ALTER TABLE "users" ALTER COLUMN "id3" SET DATA TYPE geometry(point,12) USING "id3"::geometry(point,12);',
		];

		expect(st).toStrictEqual(st0);
		expect(pst).toStrictEqual(st0);
	} catch (error) {
		await postgisDb.clear();
		await postgisDb.close();
		throw error;
	}

	await postgisDb.clear();
	await postgisDb.close();
});

test('defaults: timestamptz with precision', async () => {
	const schema1 = {
		users: pgTable('users', {
			time: timestamp('time', { withTimezone: true, precision: 6, mode: 'string' }).default(
				'2023-12-12 13:00:00.123456',
			),
			time2: timestamp('time2', { withTimezone: true, precision: 6, mode: 'string' }).default(
				'2023-12-12 13:00:00.123456',
			),
		}),
	};
	const schema2 = {
		users: pgTable('users', {
			time: timestamp('time', { withTimezone: true, precision: 6, mode: 'string' }).default(
				'2023-12-12 13:00:00.123455',
			),
			time2: timestamp('time2', { withTimezone: true, precision: 6, mode: 'string' }).default(
				'2023-12-12 13:00:00.123456',
			),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({
		db,
		to: schema1,
		tables: ['users'],
		schemas: ['public'],
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		tables: ['users'],
		schemas: ['public'],
	});

	const st0: string[] = [
		`ALTER TABLE "users" ALTER COLUMN "time" SET DEFAULT '2023-12-12 13:00:00.123455+00';`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5119
test('no diff for all column types', async () => {
	const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		columns: pgTable('columns', {
			enum: myEnum('my_enum').default('a'),
			smallint: smallint().default(10),
			integer: integer().default(10),
			numeric: numeric().default('99.9'),
			numeric1: numeric({ precision: 3, scale: 1 }).default('99.9'),
			numeric2: numeric({ precision: 1, scale: 1 }).default('99.9'),
			numeric3: numeric({ precision: 78 }).default('999'),
			bigint: bigint({ mode: 'number' }).default(100),
			bigint1: bigint({ mode: 'bigint' }).default(100n),
			boolean: boolean().default(true),
			text: text().default('abc'),
			text1: text().default(sql`gen_random_uuid()`),
			text2: text().default('``'),
			text3: text().default(''),
			varchar: varchar({ length: 25 }).default('abc'),
			varchar1: varchar({ length: 25 }).default(''),
			varchar2: varchar({ length: 25 }).default('``'),
			char: char({ length: 3 }).default('abc'),
			char1: char({ length: 3 }).default(''),
			char2: char({ length: 3 }).default('``'),
			serial: serial(),
			bigserial: bigserial({ mode: 'number' }),
			smallserial: smallserial(),
			doublePrecision: doublePrecision().default(100.12),
			real: real().default(100.123),
			json: json().default({ attr: 'value' }),
			json1: json().default({ b: 2, a: 1 }),
			jsonb: jsonb().default({ attr: 'value' }),
			jsonb1: jsonb().default(sql`jsonb_build_object()`),
			jsonb2: jsonb().default({}),
			jsonb3: jsonb().default({ b: 2, a: 1 }),
			time1: time().default('00:00:00'),
			time2: time().defaultNow(),
			timestamp1: timestamp({ withTimezone: true, precision: 6 }).default(new Date()),
			timestamp2: timestamp({ withTimezone: true, precision: 6 }).defaultNow(),
			timestamp3: timestamp({ withTimezone: true, precision: 6 }).default(sql`timezone('utc'::text, now())`),
			date1: date().default('2024-01-01'),
			date2: date().defaultNow(),
			date3: date().default(sql`CURRENT_TIMESTAMP`),
			uuid1: uuid().default('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
			uuid2: uuid().defaultRandom(),
			inet: inet().default('127.0.0.1'),
			cidr: cidr().default('127.0.0.1/32'),
			macaddr: macaddr().default('00:00:00:00:00:00'),
			macaddr8: macaddr8().default('00:00:00:ff:fe:00:00:00'),
			interval: interval().default('1 day 01:00:00'),
		}),
	};

	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });

	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

// TODO: remove this test after transfering all helpful .default(...) to pg-defaults.test.ts
test('no diff for all column array types', async () => {
	const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		columns: pgTable('columns', {
			enum: myEnum().array().default([]),
			enum1: myEnum().array().default(['a', 'b']),
			smallint: smallint().array().default([]),
			smallint1: smallint().array().default([10, 20]),
			integer: integer().array().default([]),
			integer1: integer().array().default([10, 20]),
			numeric: numeric({ precision: 3, scale: 1 }).array().default([]),
			numeric1: numeric({ precision: 3, scale: 1 }).array().default(['99.9', '88.8']),
			bigint: bigint({ mode: 'number' }).array().default([]),
			bigint1: bigint({ mode: 'number' }).array().default([100, 200]),
			boolean: boolean().array().default([]),
			boolean1: boolean().array().default([true, false]),
			text: text().array().default([]),
			text1: text().array().default(['abc', 'def']),
			varchar: varchar({ length: 25 }).array().default([]),
			varchar1: varchar({ length: 25 }).array().default(['abc', 'def']),
			char: char({ length: 3 }).array().default([]),
			char1: char({ length: 3 }).array().default(['abc', 'def']),
			doublePrecision: doublePrecision().array().default([]),
			doublePrecision1: doublePrecision().array().default([100, 200]),
			real: real().array().default([]),
			real1: real().array().default([100, 200]),
			json: json().array().default([]),
			json1: json().array().default([{ attr: 'value1' }, { attr: 'value2' }]),
			jsonb: jsonb().array().default([]),
			jsonb1: jsonb().array().default(sql`'{}'`),
			// jsonb2: jsonb().array().default([{ attr: 'value1' }, { attr: 'value2' }]),
			time: time().array().default([]),
			time1: time().array().default(['00:00:00', '01:00:00']),
			timestamp: timestamp({ withTimezone: true, precision: 6 }).array().default([]),
			timestamp1: timestamp({ withTimezone: true, precision: 6 }).array().default([
				new Date(),
				new Date(),
			]),
			date: date().array().default([]),
			date1: date().array().default(['2024-01-01', '2024-01-02']),
			uuid: uuid().array().default([]),
			uuid1: uuid().array().default([
				'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
				'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
			]),
			inet: inet().array().default([]),
			inet1: inet().array().default(['127.0.0.1', '127.0.0.2']),
			cidr: cidr().array().default([]),
			cidr1: cidr().array().default(['127.0.0.1/32', '127.0.0.2/32']),
			macaddr: macaddr().array().default([]),
			macaddr1: macaddr().array().default(['00:00:00:00:00:00', '00:00:00:00:00:01']),
			macaddr8: macaddr8().array().default([]),
			macaddr8_1: macaddr8().array().default(['00:00:00:ff:fe:00:00:00', '00:00:00:ff:fe:00:00:01']),
			interval: interval().array().default([]),
			interval1: interval().array().default(['1 day 01:00:00', '1 day 02:00:00']),
		}),
	};

	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });

	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

test('no diff for enum and custom type in different schemas', async () => {
	const mySchema = pgSchema('my_schema');
	const mySchemaEnum = mySchema.enum('my_schema_enum', ['a', 'b', 'c']);
	const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		mySchema,
		mySchemaEnum,
		mySchemaTable: mySchema.table('my_schema_table', {
			mySchemaEnum: mySchemaEnum().default('a'),
			mySchemaCustomType: customType({
				dataType: () => 'tsvector',
			})().default("to_tsvector('english'::regconfig, 'The Fat Rats'::text)"),
		}),
		myEnum,
		table: pgTable('table', {
			enum: myEnum().default('a'),
			customType: customType({
				dataType: () => 'tsvector',
			})().default("to_tsvector('english'::regconfig, 'The Fat Rats'::text)"),
		}),
	};

	const schemas = ['public', 'my_schema'];
	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema, schemas });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema, schemas });

	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

test('no diff for enum array type in different schemas', async () => {
	const mySchema = pgSchema('my_schema');
	const mySchemaEnum = mySchema.enum('my_schema_enum', ['a', 'b', 'c']);
	const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		mySchema,
		mySchemaEnum,
		mySchemaTable: mySchema.table('my_schema_table', {
			mySchemaEnum: mySchemaEnum().array().default(['a']),
			mySchemaEnum1: mySchemaEnum().array().default([]),
		}),
		myEnum,
		table: pgTable('table', {
			enum: myEnum().array().default([]),
			enum1: myEnum().array().default(['a', 'b']),
		}),
	};

	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });

	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

test('column with not null was renamed and dropped not null', async () => {
	const from = {
		users: pgTable('users', {
			id: serial().primaryKey(),
			name: varchar('name').notNull(),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: serial().primaryKey(),
			name: varchar('name2'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, ['public.users.name->public.users.name2']);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['public.users.name->public.users.name2'] });
	const { sqlStatements: sbsqSt } = await push({ db, to: to });

	const st0: string[] = [
		`ALTER TABLE "users" RENAME COLUMN "name" TO "name2";`,
		`ALTER TABLE "users" ALTER COLUMN "name2" DROP NOT NULL;`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(sbsqSt).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2856
test('alter text to timestamp', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: timestamp(),
		}),
	};

	await push({ db, to: from });
	const res = await push({ db, to });

	expect(res.sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "name" SET DATA TYPE timestamp USING "name"::timestamp;',
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2183
test('alter integer type to serial type', async () => {
	const schema1 = {
		table1: pgTable('table1', {
			col1: integer(),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const schema2 = {
		table1: pgTable('table1', {
			col1: serial(),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'CREATE SEQUENCE "table1_col1_seq";',
		`ALTER TABLE "table1" ALTER COLUMN \"col1\" SET DEFAULT nextval('table1_col1_seq')`,
		'ALTER SEQUENCE "table1_col1_seq" OWNED BY "public"."table1"."col1";',
		'ALTER TABLE "table1" ALTER COLUMN "col1" SET DATA TYPE int USING "col1"::int;',
		'ALTER TABLE "table1" ALTER COLUMN "col1" SET NOT NULL;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('same column names in two tables. Check for correct not null creation. Explicit column names', async (t) => {
	const users = pgTable(
		'users',
		{
			id: integer('id').primaryKey(),
			departmentId: integer('department_id').references(() => departments.id, { onDelete: 'set null' }),
		},
	);
	const userHasDepartmentFilter = pgTable(
		'user_has_department_filter',
		{
			userId: integer('user_id').references(() => users.id),
			departmentId: integer('department_id').references(() => departments.id),
		},
		(table) => {
			return [primaryKey({ columns: [table.userId, table.departmentId] })];
		},
	);
	const departments = pgTable(
		'departments',
		{
			id: integer('id').primaryKey(),
		},
	);

	// order matters here
	const schema1 = { departments, userHasDepartmentFilter, users };
	const { sqlStatements: st } = await diff({}, schema1, []);
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	const st0 = [
		`CREATE TABLE "departments" (
\t"id" integer PRIMARY KEY
);\n`,
		`CREATE TABLE "user_has_department_filter" (
\t"user_id" integer,
\t"department_id" integer,
\tCONSTRAINT "user_has_department_filter_pkey" PRIMARY KEY("user_id","department_id")
);\n`,
		`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY,
\t"department_id" integer
);\n`,

		`ALTER TABLE "user_has_department_filter" ADD CONSTRAINT "user_has_department_filter_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");`,
		`ALTER TABLE "user_has_department_filter" ADD CONSTRAINT "user_has_department_filter_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id");`,
		`ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('same column names in two tables. Check for correct not null creation #2. no casing', async (t) => {
	const users = pgTable(
		'users',
		{
			id: integer().primaryKey(),
			departmentId: integer().references(() => departments.id, { onDelete: 'set null' }),
		},
	);
	const userHasDepartmentFilter = pgTable(
		'user_has_department_filter',
		{
			userId: integer().references(() => users.id),
			departmentId: integer().references(() => departments.id),
		},
		(table) => {
			return [primaryKey({ columns: [table.userId, table.departmentId] })];
		},
	);
	const departments = pgTable(
		'departments',
		{
			id: integer().primaryKey(),
		},
	);

	// order matters here
	const schema1 = { departments, userHasDepartmentFilter, users };
	const { sqlStatements: st } = await diff({}, schema1, []);
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	const st0 = [
		`CREATE TABLE "departments" (
\t"id" integer PRIMARY KEY
);\n`,
		`CREATE TABLE "user_has_department_filter" (
\t"userId" integer,
\t"departmentId" integer,
\tCONSTRAINT "user_has_department_filter_pkey" PRIMARY KEY("userId","departmentId")
);\n`,
		`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY,
\t"departmentId" integer
);\n`,

		`ALTER TABLE "user_has_department_filter" ADD CONSTRAINT "user_has_department_filter_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id");`,
		`ALTER TABLE "user_has_department_filter" ADD CONSTRAINT "user_has_department_filter_departmentId_departments_id_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id");`,
		`ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_departments_id_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('same column names in two tables. Check for correct not null creation #3. camelCase', async (t) => {
	const users = pgTable(
		'users',
		{
			id: integer().primaryKey(),
			departmentId: integer().references(() => departments.id, { onDelete: 'set null' }),
		},
	);
	const userHasDepartmentFilter = pgTable(
		'user_has_department_filter',
		{
			userId: integer().references(() => users.id),
			departmentId: integer().references(() => departments.id),
		},
		(table) => {
			return [primaryKey({ columns: [table.userId, table.departmentId] })];
		},
	);
	const departments = pgTable(
		'departments',
		{
			id: integer().primaryKey(),
		},
	);

	// order matters here
	const schema1 = { departments, userHasDepartmentFilter, users };
	const { sqlStatements: st } = await diff({}, schema1, [], 'camelCase');
	const { sqlStatements: pst } = await push({ db, to: schema1, casing: 'camelCase' });

	const st0 = [
		`CREATE TABLE "departments" (
\t"id" integer PRIMARY KEY
);\n`,
		`CREATE TABLE "user_has_department_filter" (
\t"userId" integer,
\t"departmentId" integer,
\tCONSTRAINT "user_has_department_filter_pkey" PRIMARY KEY("userId","departmentId")
);\n`,
		`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY,
\t"departmentId" integer
);\n`,

		`ALTER TABLE "user_has_department_filter" ADD CONSTRAINT "user_has_department_filter_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id");`,
		`ALTER TABLE "user_has_department_filter" ADD CONSTRAINT "user_has_department_filter_departmentId_departments_id_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id");`,
		`ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_departments_id_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('same column names in two tables. Check for correct not null creation #4. snake_case', async (t) => {
	const users = pgTable(
		'users',
		{
			id: integer().primaryKey(),
			departmentId: integer().references(() => departments.id, { onDelete: 'set null' }),
		},
	);
	const userHasDepartmentFilter = pgTable(
		'user_has_department_filter',
		{
			userId: integer().references(() => users.id),
			departmentId: integer().references(() => departments.id),
		},
		(table) => {
			return [primaryKey({ columns: [table.userId, table.departmentId] })];
		},
	);
	const departments = pgTable(
		'departments',
		{
			id: integer().primaryKey(),
		},
	);

	// order matters here
	const schema1 = { departments, userHasDepartmentFilter, users };
	const { sqlStatements: st } = await diff({}, schema1, [], 'snake_case');
	const { sqlStatements: pst } = await push({ db, to: schema1, casing: 'snake_case' });

	const st0 = [
		`CREATE TABLE "departments" (
\t"id" integer PRIMARY KEY
);\n`,
		`CREATE TABLE "user_has_department_filter" (
\t"user_id" integer,
\t"department_id" integer,
\tCONSTRAINT "user_has_department_filter_pkey" PRIMARY KEY("user_id","department_id")
);\n`,
		`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY,
\t"department_id" integer
);\n`,

		`ALTER TABLE "user_has_department_filter" ADD CONSTRAINT "user_has_department_filter_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");`,
		`ALTER TABLE "user_has_department_filter" ADD CONSTRAINT "user_has_department_filter_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id");`,
		`ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
