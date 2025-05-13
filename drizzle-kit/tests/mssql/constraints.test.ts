import { sql } from 'drizzle-orm';
import { bit, check, int, mssqlSchema, mssqlTable, primaryKey, text, varchar } from 'drizzle-orm/mssql-core';
import { defaultNameForPK } from 'src/dialects/mssql/grammar';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('drop primary key', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().primaryKey(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const { sqlStatements: sqlStatements1 } = await diff({}, schema1, []);

	expect(sqlStatements1).toStrictEqual([
		`CREATE TABLE [table] (
\t[id] int,
\tCONSTRAINT [table_pkey] PRIMARY KEY([id])
);\n`,
	]);

	const { sqlStatements: sqlStatements2 } = await diff(schema1, schema2, []);

	expect(sqlStatements2).toStrictEqual([
		'ALTER TABLE [table] DROP CONSTRAINT [table_pkey];',
	]);
});

test('drop unique', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().unique(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const { sqlStatements: sqlStatements1 } = await diff({}, schema1, []);

	expect(sqlStatements1).toStrictEqual([
		`CREATE TABLE [table] (
\t[id] int,
\tCONSTRAINT [table_id_key] UNIQUE([id])
);\n`,
	]);

	const { sqlStatements: sqlStatements2 } = await diff(schema1, schema2, []);

	expect(sqlStatements2).toStrictEqual([
		'ALTER TABLE [table] DROP CONSTRAINT [table_id_key];',
	]);
});

test('add fk', async () => {
	const table = mssqlTable('table', {
		id: int(),
	});
	const table1 = mssqlTable('table1', {
		id: int(),
	});
	const schema1 = {
		table,
		table1,
	};

	const table1WithReference = mssqlTable('table1', {
		id: int().references(() => table.id),
	});
	const schema2 = {
		table,
		table1: table1WithReference,
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [table1] ADD CONSTRAINT [table1_id_table_id_fk] FOREIGN KEY ([id]) REFERENCES [table]([id]);',
	]);
});

test('drop fk', async () => {
	const table = mssqlTable('table', {
		id: int(),
	});
	const table1WithReference = mssqlTable('table1', {
		id: int().references(() => table.id),
	});

	const schema1 = {
		table,
		table1: table1WithReference,
	};

	const table1 = mssqlTable('table1', {
		id: int(),
	});
	const schema2 = {
		table,
		table1,
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [table1] DROP CONSTRAINT [table1_id_table_id_fk];\n',
	]);
});

test('rename pk #1', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id1: int('id1'),
				id2: int('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })],
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id1: int('id1'),
			id2: int('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users.compositePK->dbo.users.${defaultNameForPK('users')}`,
	]);

	expect(sqlStatements).toStrictEqual([`EXEC sp_rename 'compositePK', [users_pkey], 'OBJECT';`]);
});

test('add unique', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int().unique(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [table] ADD CONSTRAINT [table_id_key] UNIQUE([id]);',
	]);
});

test('drop unique', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().unique(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [table] DROP CONSTRAINT [table_id_key];',
	]);
});

test('rename unique', async (t) => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().unique('old_name'),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int().unique('new_name'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.table.old_name->dbo.table.new_name`,
	]);

	expect(sqlStatements).toStrictEqual([`EXEC sp_rename 'old_name', [new_name], 'OBJECT';`]);
});
