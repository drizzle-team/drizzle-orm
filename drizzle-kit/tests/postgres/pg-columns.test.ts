import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	char,
	date,
	doublePrecision,
	geometry,
	index,
	integer,
	interval,
	json,
	jsonb,
	numeric,
	pgEnum,
	pgSchema,
	pgTable,
	primaryKey,
	real,
	serial,
	smallint,
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

	const { sqlStatements: pst, losses } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE TABLE "table" (\n\t"col1" integer NOT NULL,\n\t"col2" integer NOT NULL,\n\tCONSTRAINT "table_pkey" PRIMARY KEY("col1","col2")\n);\n',
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
	const { sqlStatements: pst, losses } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;'];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// TODO: revise should I use suggestion func?
	// const { losses, hints } = await suggestions(db, statements);

	expect(losses).toStrictEqual([]);
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
			'ALTER TABLE "users" ALTER COLUMN "id3" SET DATA TYPE geometry(point,12);',
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

test('no diffs for all database types', async () => {
	const customSchema = pgSchema('schemass');

	const transactionStatusEnum = customSchema.enum('TransactionStatusEnum', ['PENDING', 'FAILED', 'SUCCESS']);

	const enumname = pgEnum('enumname', ['three', 'two', 'one']);

	const schema1 = {
		test: pgEnum('test', ['ds']),
		testHello: pgEnum('test_hello', ['ds']),
		enumname: pgEnum('enumname', ['three', 'two', 'one']),

		customSchema: customSchema,
		transactionStatusEnum: customSchema.enum('TransactionStatusEnum', ['PENDING', 'FAILED', 'SUCCESS']),

		allSmallSerials: pgTable('schema_test', {
			columnAll: uuid('column_all').defaultRandom(),
			column: transactionStatusEnum('column').notNull(),
		}),

		allSmallInts: customSchema.table(
			'schema_test2',
			{
				columnAll: smallint('column_all').default(124).notNull(),
				column: smallint('columns').array(),
				column1: smallint('column1').array().array(),
				column2: smallint('column2').array().array(),
				column3: smallint('column3').array(),
			},
			(t: any) => [uniqueIndex('testdfds').on(t.column)],
		),

		allEnums: customSchema.table(
			'all_enums',
			{
				columnAll: enumname('column_all').default('three').notNull(),
				column: enumname('columns'),
			},
			(t: any) => [index('ds').on(t.column)],
		),

		allTimestamps: customSchema.table('all_timestamps', {
			columnDateNow: timestamp('column_date_now', {
				precision: 1,
				withTimezone: true,
				mode: 'string',
			}).defaultNow(),
			columnAll: timestamp('column_all', { mode: 'string' }).default('2023-03-01 12:47:29.792'),
			column: timestamp('column', { mode: 'string' }).default(sql`'2023-02-28 16:18:31.18'`),
			column2: timestamp('column2', { mode: 'string', precision: 3 }).default(sql`'2023-02-28 16:18:31.18'`),
		}),

		allUuids: customSchema.table('all_uuids', {
			columnAll: uuid('column_all').defaultRandom().notNull(),
			column: uuid('column'),
		}),

		allDates: customSchema.table('all_dates', {
			column_date_now: date('column_date_now').defaultNow(),
			column_all: date('column_all', { mode: 'date' }).default(new Date()).notNull(),
			column: date('column'),
		}),

		allReals: customSchema.table('all_reals', {
			columnAll: real('column_all').default(32).notNull(),
			column: real('column'),
			columnPrimary: real('column_primary').primaryKey().notNull(),
		}),

		allBigints: pgTable('all_bigints', {
			columnAll: bigint('column_all', { mode: 'number' }).default(124).notNull(),
			column: bigint('column', { mode: 'number' }),
		}),

		allBigserials: customSchema.table('all_bigserials', {
			columnAll: bigserial('column_all', { mode: 'bigint' }).notNull(),
			column: bigserial('column', { mode: 'bigint' }).notNull(),
		}),

		allIntervals: customSchema.table('all_intervals', {
			columnAllConstrains: interval('column_all_constrains', {
				fields: 'month',
			})
				.default('1 mon')
				.notNull(),
			columnMinToSec: interval('column_min_to_sec', {
				fields: 'minute to second',
			}),
			columnWithoutFields: interval('column_without_fields').default('00:00:01').notNull(),
			column: interval('column'),
			column5: interval('column5', {
				fields: 'minute to second',
				precision: 3,
			}),
			column6: interval('column6'),
		}),

		allSerials: customSchema.table('all_serials', {
			columnAll: serial('column_all').notNull(),
			column: serial('column').notNull(),
		}),

		allTexts: customSchema.table(
			'all_texts',
			{
				columnAll: text('column_all').default('text').notNull(),
				column: text('columns').primaryKey(),
			},
			(t: any) => [index('test').on(t.column)],
		),

		allBools: customSchema.table('all_bools', {
			columnAll: boolean('column_all').default(true).notNull(),
			column: boolean('column'),
		}),

		allVarchars: customSchema.table('all_varchars', {
			columnAll: varchar('column_all').default('text').notNull(),
			column: varchar('column', { length: 200 }),
		}),

		allTimes: customSchema.table('all_times', {
			columnDateNow: time('column_date_now').defaultNow(),
			columnAll: time('column_all').default('22:12:12').notNull(),
			column: time('column'),
		}),

		allChars: customSchema.table('all_chars', {
			columnAll: char('column_all', { length: 1 }).default('text').notNull(),
			column: char('column', { length: 1 }),
		}),

		allDoublePrecision: customSchema.table('all_double_precision', {
			columnAll: doublePrecision('column_all').default(33.2).notNull(),
			column: doublePrecision('column'),
		}),

		allJsonb: customSchema.table('all_jsonb', {
			columnDefaultObject: jsonb('column_default_object').default({ hello: 'world world' }).notNull(),
			columnDefaultArray: jsonb('column_default_array').default({
				hello: { 'world world': ['foo', 'bar'] },
			}),
			column: jsonb('column'),
		}),

		allJson: customSchema.table('all_json', {
			columnDefaultObject: json('column_default_object').default({ hello: 'world world' }).notNull(),
			columnDefaultArray: json('column_default_array').default({
				hello: { 'world world': ['foo', 'bar'] },
				foo: 'bar',
				fe: 23,
			}),
			column: json('column'),
		}),

		allIntegers: customSchema.table('all_integers', {
			columnAll: integer('column_all').primaryKey(),
			column: integer('column'),
			columnPrimary: integer('column_primary'),
		}),

		allNumerics: customSchema.table('all_numerics', {
			columnAll: numeric('column_all', { precision: 1, scale: 1 }).default('32').notNull(),
			column: numeric('column'),
			columnPrimary: numeric('column_primary').primaryKey().notNull(),
		}),
	};

	const schemas = ['public', 'schemass'];
	const { sqlStatements: st } = await diff(schema1, schema1, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema1, schemas });

	const st0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
