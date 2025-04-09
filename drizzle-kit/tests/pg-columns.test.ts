import { integer, pgTable, primaryKey, serial, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

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

	const { statements } = await diffTestSchemas(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'users',
		schema: '',
		column: { name: 'name', type: 'text', primaryKey: false, notNull: false },
	});
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

	const { statements } = await diffTestSchemas(schema1, schema2, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'users',
		schema: '',
		column: { name: 'name', type: 'text', primaryKey: false, notNull: false },
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'users',
		schema: '',
		column: { name: 'email', type: 'text', primaryKey: false, notNull: false },
	});
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

	const { statements } = await diffTestSchemas(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_rename_column',
		tableName: 'users',
		schema: '',
		oldColumnName: 'name',
		newColumnName: 'name1',
	});
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

	const { statements } = await diffTestSchemas(schema1, schema2, [
		'public.users.name->public.users.name1',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_rename_column',
		tableName: 'users',
		schema: '',
		oldColumnName: 'name',
		newColumnName: 'name1',
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'users',
		schema: '',
		column: {
			name: 'email',
			notNull: false,
			primaryKey: false,
			type: 'text',
		},
	});
});

test('alter table add composite pk', async (t) => {
	const schema1 = {
		table: pgTable('table', {
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const schema2 = {
		table: pgTable(
			'table',
			{
				id1: integer('id1'),
				id2: integer('id2'),
			},
			(t) => {
				return {
					pk: primaryKey({ columns: [t.id1, t.id2] }),
				};
			},
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_composite_pk',
		tableName: 'table',
		data: 'id1,id2;table_id1_id2_pk',
		schema: '',
		constraintName: 'table_id1_id2_pk',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'ALTER TABLE "table" ADD CONSTRAINT "table_id1_id2_pk" PRIMARY KEY("id1","id2");',
	);
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

	const { statements } = await diffTestSchemas(schema1, schema2, [
		'public.users->public.users1',
		'public.users1.id->public.users1.id1',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users',
		tableNameTo: 'users1',
		fromSchema: '',
		toSchema: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_rename_column',
		oldColumnName: 'id',
		newColumnName: 'id1',
		schema: '',
		tableName: 'users1',
	});
});

test('with composite pks #1', async (t) => {
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
		users: pgTable(
			'users',
			{
				id1: integer('id1'),
				id2: integer('id2'),
				text: text('text'),
			},
			(t) => {
				return {
					pk: primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' }),
				};
			},
		),
	};

	const { statements } = await diffTestSchemas(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'users',
		schema: '',
		column: {
			name: 'text',
			notNull: false,
			primaryKey: false,
			type: 'text',
		},
	});
});

test('with composite pks #2', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const schema2 = {
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

	const { statements } = await diffTestSchemas(schema1, schema2, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_composite_pk',
		tableName: 'users',
		schema: '',
		constraintName: 'compositePK',
		data: 'id1,id2;compositePK',
	});
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
		users: pgTable(
			'users',
			{
				id1: integer('id1'),
				id3: integer('id3'),
			},
			(t) => {
				return {
					pk: primaryKey({ columns: [t.id1, t.id3], name: 'compositePK' }),
				};
			},
		),
	};

	// TODO: remove redundand drop/create create constraint
	const { statements } = await diffTestSchemas(schema1, schema2, [
		'public.users.id2->public.users.id3',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_rename_column',
		tableName: 'users',
		schema: '',
		newColumnName: 'id3',
		oldColumnName: 'id2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_composite_pk',
		tableName: 'users',
		schema: '',
		new: 'id1,id3;compositePK',
		old: 'id1,id2;compositePK',
		newConstraintName: 'compositePK',
		oldConstraintName: 'compositePK',
	});
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
	const { statements } = await diffTestSchemas(schema1, schema2, []);

	expect(statements.length).toBe(6);
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
	const { statements } = await diffTestSchemas(schema1, schema2, []);

	expect(statements.length).toBe(6);
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
	const { statements } = await diffTestSchemas(schema1, schema2, []);

	expect(statements.length).toBe(6);
});

test('varchar and text default values escape single quotes', async (t) => {
	const schema1 = {
		table: pgTable('table', {
			id: serial('id').primaryKey(),
		}),
	};

	const schem2 = {
		table: pgTable('table', {
			id: serial('id').primaryKey(),
			text: text('text').default("escape's quotes"),
			varchar: varchar('varchar').default("escape's quotes"),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schem2, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toStrictEqual(
		'ALTER TABLE "table" ADD COLUMN "text" text DEFAULT \'escape\'\'s quotes\';',
	);
	expect(sqlStatements[1]).toStrictEqual(
		'ALTER TABLE "table" ADD COLUMN "varchar" varchar DEFAULT \'escape\'\'s quotes\';',
	);
});
