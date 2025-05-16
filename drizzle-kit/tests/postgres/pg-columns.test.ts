import { boolean, integer, pgTable, primaryKey, serial, text, uuid, varchar } from 'drizzle-orm/pg-core';
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
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

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

	// TODO: remove redundand drop/create create constraint
	const { sqlStatements: st } = await diff(schema1, schema2, [
		'public.users.id2->public.users.id3',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [
			'public.users.id2->public.users.id3',
		],
	});

	const st0 = ['ALTER TABLE "users" RENAME COLUMN "id2" TO "id3";'];
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
		id1: uuid('id1').primaryKey().defaultRandom(),
		id2: uuid('id2').primaryKey().defaultRandom(),
		id3: uuid('id3').primaryKey().defaultRandom(),
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
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

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
