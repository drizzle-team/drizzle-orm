import { boolean, integer, pgTable, primaryKey, serial, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './mocks';

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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ADD COLUMN "name" text;']);
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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ADD COLUMN "name" text;',
		'ALTER TABLE "users" ADD COLUMN "email" text;',
	]);
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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" RENAME COLUMN "name" TO "name1";']);
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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" RENAME COLUMN "name" TO "name1";',
		'ALTER TABLE "users" ADD COLUMN "email" text;',
	]);
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

	const { sqlStatements } = await diffTestSchemas(
		schema1,
		schema2,
		[],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "table" ADD PRIMARY KEY ("id1","id2");']);
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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, [
		'public.users->public.users1',
		'public.users1.id->public.users1.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" RENAME TO "users1";',
		'ALTER TABLE "users1" RENAME COLUMN "id" TO "id1";',
	]);
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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ADD COLUMN "text" text;']);
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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ADD CONSTRAINT "compositePK" PRIMARY KEY("id1","id2");']);
});

test('with composite pks #3', async (t) => {
	const schema1 = {
		users: pgTable(
			'users',
			{
				id1: integer('id1'),
				id2: integer('id2'),
			},
			(t) => {
				return {
					pk: primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' }),
				};
			},
		),
	};

	const schema2 = {
		users: pgTable('users', {
			id1: integer('id1'),
			id3: integer('id3'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id3], name: 'compositePK' })]),
	};

	// TODO: remove redundand drop/create create constraint
	const { sqlStatements } = await diffTestSchemas(schema1, schema2, [
		'public.users.id2->public.users.id3',
	]);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" RENAME COLUMN "id2" TO "id3";']);
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
	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([]);
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
	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([]);
});

test('add multiple constraints #3', async (t) => {
	const t1 = pgTable('t1', {
		id1: uuid('id1').primaryKey().defaultRandom(),
		id2: uuid('id2').primaryKey().defaultRandom(),
		id3: uuid('id3').primaryKey().defaultRandom(),
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
	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([]);
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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "table" ADD COLUMN "text" text DEFAULT 'escape''s quotes';`,
		`ALTER TABLE "table" ADD COLUMN "varchar" varchar DEFAULT 'escape''s quotes';`,
	]);
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

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	// TODO: check for created tables, etc
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ADD COLUMN "text1" text DEFAULT \'\';',
		'ALTER TABLE "table" ADD COLUMN "text2" text DEFAULT \'text\';',
		'ALTER TABLE "table" ADD COLUMN "int1" integer DEFAULT 10;',
		'ALTER TABLE "table" ADD COLUMN "int2" integer DEFAULT 0;',
		'ALTER TABLE "table" ADD COLUMN "int3" integer DEFAULT -10;',
		'ALTER TABLE "table" ADD COLUMN "bool1" boolean DEFAULT true;',
		'ALTER TABLE "table" ADD COLUMN "bool2" boolean DEFAULT false;',
	]);
});
