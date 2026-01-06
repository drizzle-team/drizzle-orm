import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	bit,
	bool,
	boolean,
	char,
	cockroachEnum,
	cockroachSchema,
	cockroachTable,
	date,
	decimal,
	doublePrecision,
	float,
	index,
	int2,
	int4,
	int8,
	interval,
	jsonb,
	numeric,
	primaryKey,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varbit,
	varchar,
} from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('add columns #1', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = ['ALTER TABLE "users" ADD COLUMN "name" string;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('add columns #2', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
			email: text('email'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		'ALTER TABLE "users" ADD COLUMN "name" string;',
		'ALTER TABLE "users" ADD COLUMN "email" string;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('column conflict duplicate name #1', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id'),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id'),
			name: varchar('name', { length: 100 }).primaryKey(),
			email: text('name'),
		}),
	};

	await push({ to: schema1, db });

	await expect(diff(schema1, schema2, [])).rejects.toThrowError(); // duplicate names in columns
	await expect(push({ to: schema2, db })).rejects.toThrowError(); // duplicate names in columns
});

test.concurrent('alter column change name #1', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
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

test.concurrent('alter column change name #2', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
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
		'ALTER TABLE "users" ADD COLUMN "email" string;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

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

test.concurrent('rename table rename column #1', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id'),
		}),
	};

	const schema2 = {
		users: cockroachTable('users1', {
			id: int4('id1'),
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

test.concurrent('with composite pks #1', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id1: int4('id1'),
			id2: int4('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id1: int4('id1'),
			id2: int4('id2'),
			text: text('text'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = ['ALTER TABLE "users" ADD COLUMN "text" string;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('with composite pks #3', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable(
			'users',
			{
				id1: int4('id1'),
				id2: int4('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })],
		),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id1: int4('id1'),
			id3: int4('id3'),
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

test.concurrent('create composite primary key', async ({ dbc: db }) => {
	const schema1 = {};

	const schema2 = {
		table: cockroachTable('table', {
			col1: int4('col1').notNull(),
			col2: int4('col2').notNull(),
		}, (t) => [primaryKey({
			columns: [t.col1, t.col2],
		})]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE TABLE "table" (\n\t"col1" int4,\n\t"col2" int4,\n\tCONSTRAINT "table_pkey" PRIMARY KEY("col1","col2")\n);\n',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('add multiple constraints #1', async ({ dbc: db }) => {
	const t1 = cockroachTable('t1', {
		id: uuid('id').primaryKey().defaultRandom(),
	});

	const t2 = cockroachTable('t2', {
		id: uuid('id').primaryKey().defaultRandom(),
	});

	const t3 = cockroachTable('t3', {
		id: uuid('id').primaryKey().defaultRandom(),
	});

	const schema1 = {
		t1,
		t2,
		t3,
		ref1: cockroachTable('ref1', {
			id1: uuid('id1').references(() => t1.id),
			id2: uuid('id2').references(() => t2.id),
			id3: uuid('id3').references(() => t3.id),
		}),
	};

	const schema2 = {
		t1,
		t2,
		t3,
		ref1: cockroachTable('ref1', {
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

test.concurrent('add multiple constraints #2', async ({ dbc: db }) => {
	const t1 = cockroachTable('t1', {
		id1: uuid('id1').unique(),
		id2: uuid('id2').unique(),
		id3: uuid('id3').unique(),
	});

	const schema1 = {
		t1,
		ref1: cockroachTable('ref1', {
			id1: uuid('id1').references(() => t1.id1),
			id2: uuid('id2').references(() => t1.id2),
			id3: uuid('id3').references(() => t1.id3),
		}),
	};

	const schema2 = {
		t1,
		ref1: cockroachTable('ref1', {
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

test.concurrent('add multiple constraints #3', async ({ dbc: db }) => {
	const t1 = cockroachTable('t1', {
		id1: uuid('id1').unique(),
		id2: uuid('id2').unique(),
		id3: uuid('id3').unique(),
	});

	const schema1 = {
		t1,
		ref1: cockroachTable('ref1', {
			id: uuid('id').references(() => t1.id1),
		}),
		ref2: cockroachTable('ref2', {
			id: uuid('id').references(() => t1.id2),
		}),
		ref3: cockroachTable('ref3', {
			id: uuid('id').references(() => t1.id3),
		}),
	};

	const schema2 = {
		t1,
		ref1: cockroachTable('ref1', {
			id: uuid('id').references(() => t1.id1, { onDelete: 'cascade' }),
		}),
		ref2: cockroachTable('ref2', {
			id: uuid('id').references(() => t1.id2, { onDelete: 'set null' }),
		}),
		ref3: cockroachTable('ref3', {
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

test.concurrent('varchar and text default values escape single quotes', async ({ dbc: db }) => {
	const schema1 = {
		table: cockroachTable('table', {
			id: int4('id').primaryKey(),
		}),
	};

	const schema2 = {
		table: cockroachTable('table', {
			id: int4('id').primaryKey(),
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
		`ALTER TABLE "table" ADD COLUMN "text" string DEFAULT e'escape\\'s quotes';`,
		`ALTER TABLE "table" ADD COLUMN "varchar" varchar DEFAULT e'escape\\'s quotes';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('add columns with defaults', async ({ dbc: db }) => {
	const schema1 = {
		table: cockroachTable('table', {
			id: int4().primaryKey(),
		}),
	};

	const schema2 = {
		table: cockroachTable('table', {
			id: int4().primaryKey(),
			text1: text().default(''),
			text2: string({ length: 100 }).default('text'),
			int1: int4().default(10),
			int2: int4().default(0),
			int3: int4().default(-10),
			bool1: bool().default(true),
			bool2: bool().default(false),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE "table" ADD COLUMN "text1" string DEFAULT \'\';',
		'ALTER TABLE "table" ADD COLUMN "text2" string(100) DEFAULT \'text\';',
		'ALTER TABLE "table" ADD COLUMN "int1" int4 DEFAULT 10;',
		'ALTER TABLE "table" ADD COLUMN "int2" int4 DEFAULT 0;',
		'ALTER TABLE "table" ADD COLUMN "int3" int4 DEFAULT -10;',
		'ALTER TABLE "table" ADD COLUMN "bool1" bool DEFAULT true;',
		'ALTER TABLE "table" ADD COLUMN "bool2" bool DEFAULT false;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// TODO: check for created tables, etc
});

test.concurrent('add array column - empty array default', async ({ dbc: db }) => {
	const schema1 = {
		test: cockroachTable('test', {
			id: int4('id').primaryKey(),
		}),
	};
	const schema2 = {
		test: cockroachTable('test', {
			id: int4('id').primaryKey(),
			values: int4('values').array().default([]),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'ALTER TABLE "test" ADD COLUMN "values" int4[] DEFAULT \'{}\'::int4[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('add array column - default', async ({ dbc: db }) => {
	const schema1 = {
		test: cockroachTable('test', {
			id: int4('id').primaryKey(),
		}),
	};
	const schema2 = {
		test: cockroachTable('test', {
			id: int4('id').primaryKey(),
			values: int4('values').array().default([1, 2, 3]),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'ALTER TABLE "test" ADD COLUMN "values" int4[] DEFAULT \'{1,2,3}\'::int4[];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('add not null to a column', async ({ db }) => {
	const schema1 = {
		users: cockroachTable(
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
					.defaultNow()
					.notNull(),
				updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
					.notNull()
					.$onUpdate(() => new Date()),
			},
			(table) => [uniqueIndex('User_email_key').on(table.email)],
		),
	};

	const schema2 = {
		users: cockroachTable(
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
					.defaultNow()
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
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;'];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// TODO: revise should I use suggestion func?
	// const { losses, hints } = await suggestions(db, statements);
});

test.concurrent('add not null to a column with null data. Should rollback', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('User', {
			id: text('id').primaryKey(),
			name: text('name'),
			username: text('username'),
			gh_username: text('gh_username'),
			email: text('email'),
			emailVerified: timestamp('emailVerified', { precision: 3, mode: 'date' }),
			image: text('image'),
			createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).defaultNow().notNull(),
			updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' }).notNull().$onUpdate(() => new Date()),
		}, (table) => [uniqueIndex('User_email_key').on(table.email)]),
	};

	const schema2 = {
		users: cockroachTable('User', {
			id: text('id').primaryKey(),
			name: text('name'),
			username: text('username'),
			gh_username: text('gh_username'),
			email: text('email').notNull(),
			emailVerified: timestamp('emailVerified', { precision: 3, mode: 'date' }),
			image: text('image'),
			createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).defaultNow().notNull(),
			updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' }).notNull().$onUpdate(() => new Date()),
		}, (table) => [uniqueIndex('User_email_key').on(table.email)]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	await db.query(`INSERT INTO "User" (id, email, "updatedAt") values ('str', 'email@gmail', '2025-04-29 09:20:39');`);
	const { sqlStatements: pst, hints } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;'];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(hints).toStrictEqual([]);
});

test.concurrent('add generated column', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
		}),
	};
	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name}`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name") STORED;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('add generated constraint to an existing column', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name'),
		}),
	};
	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name}`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name") STORED;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('drop generated constraint from a column', async ({ dbc: db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema1.users.name}`),
		}),
	};
	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('no diffs for all database types', async ({ dbc: db }) => {
	const customSchema = cockroachSchema('schemass');

	const transactionStatusEnum = customSchema.enum('TransactionStatusEnum', ['PENDING', 'FAILED', 'SUCCESS']);

	const enumname = cockroachEnum('enumname', ['three', 'two', 'one']);

	const schema1 = {
		test: cockroachEnum('test', ['ds']),
		testHello: cockroachEnum('test_hello', ['ds']),
		enumname: cockroachEnum('enumname', ['three', 'two', 'one']),

		customSchema: customSchema,
		transactionStatusEnum: customSchema.enum('TransactionStatusEnum', ['PENDING', 'FAILED', 'SUCCESS']),

		allSmallSerials: cockroachTable('schema_test', {
			columnAll: uuid('column_all').defaultRandom(),
			column: transactionStatusEnum('column').notNull(),
		}),

		allSmallInts: customSchema.table(
			'schema_test2',
			{
				columnAll: smallint('column_all').default(124).notNull(),
				column: smallint('columns').array(),
				column2: smallint('column2').array(),
			},
			(t: any) => [uniqueIndex('testdfds').on(t.column)],
		),

		allInt2: customSchema.table(
			'all_int2',
			{
				columnAll: int2('column_all').default(124).notNull(),
				column: int2('columns').array(),
				column2: int2('column2').array(),
			},
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
		allBigints: cockroachTable('all_bigints', {
			columnAll: bigint('column_all', { mode: 'number' }).default(124).notNull(),
			column: bigint('column', { mode: 'number' }),
			column1: int8('column1', { mode: 'number' }),
			column2: int8('column2', { mode: 'bigint' }),
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

		allTexts: customSchema.table(
			'all_texts',
			{
				columnAll: text('column_all').default('text').notNull(),
				column: text('columns').primaryKey(),
			},
			(t: any) => [index('test').on(t.column)],
		),

		allStrings: customSchema.table(
			'all_strings',
			{
				columnAll: string('column_all').default('text').notNull(),
				column: string('columns').primaryKey(),
				column2: string('column2', { length: 200 }),
			},
		),
		allBools: customSchema.table('all_bools', {
			column1: bool('column1').default(true).notNull(),
			column2: bool('column2'),
			column3: boolean('column3').default(true).notNull(),
			column4: boolean('column4'),
			column5: bool('column5').default(true).notNull().array(),
			column6: bool('column6').array(),
			column7: boolean('column7').default(true).notNull().array(),
			column8: boolean('column8').array(),
		}),

		allVarchars: customSchema.table('all_varchars', {
			columnAll: varchar('column_all').default('text').notNull(),
			column: varchar('column', { length: 200 }),
		}),

		allTimes: customSchema.table('all_times', {
			columnAll: time('column_all').default('22:12:12').notNull(),
			column: time('column'),
		}),

		allChars: customSchema.table('all_chars', {
			columnAll: char('column_all', { length: 1 }).default('text').notNull(),
			column: char('column', { length: 1 }),
			columnArr: char('column_arr', { length: 1 }).array(),
		}),
		allDoublePrecision: customSchema.table('all_double_precision', {
			columnAll: doublePrecision('column_all').default(33.2).notNull(),
			column: doublePrecision('column'),
		}),

		allFloat: customSchema.table('all_float', {
			columnAll: float('column_all').default(33).notNull(),
			column: float('column'),
		}),
		allJsonb: customSchema.table('all_jsonb', {
			columnDefaultObject: jsonb('column_default_object').default({ hello: 'world world' }).notNull(),
			columnDefaultArray: jsonb('column_default_array').default({
				hello: { 'world world': ['foo', 'bar'] },
			}),
			column: jsonb('column'),
		}),

		allIntegers: customSchema.table('all_integers', {
			columnAll: int4('column_all').primaryKey(),
			column: int4('column'),
			columnPrimary: int4('column_primary'),
		}),

		allNumerics: customSchema.table('all_numerics', {
			columnAll: numeric('column_all').default('32').notNull(),
			column: numeric('column', { precision: 1, scale: 1 }),
			columnPrimary: numeric('column_primary').primaryKey().notNull(),
		}),

		allDecimals: customSchema.table('all_decimals', {
			columnAll: decimal('column_all').default('32').notNull(),
			column: decimal('column', { precision: 1, scale: 1 }),
			columnPrimary: decimal('column_primary').primaryKey().notNull(),
		}),

		allBits: customSchema.table('all_bits', {
			column1: bit('column1').default('1').notNull(),
			column2: bit('column2', { length: 10 }),
			column3: bit('column3').default('1').notNull().array(),
			column4: bit('column4', { length: 10 }).array(),
			column5: varbit('column5').notNull(),
			column6: varbit('column6', { length: 10 }),
			column7: varbit('column7').notNull().array(),
			column8: varbit('column8', { length: 10 }).array(),
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
