import {
	bigint,
	boolean,
	date,
	integer,
	json,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('array #1: empty array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: { name: 'values', type: 'integer[]', primaryKey: false, notNull: false, default: "'{}'" },
	});
});

test('array #2: integer array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([1, 2, 3]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: { name: 'values', type: 'integer[]', primaryKey: false, notNull: false, default: "'{1,2,3}'" },
	});
});

test('array #3: bigint array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: bigint('values', { mode: 'bigint' }).array().default([BigInt(1), BigInt(2), BigInt(3)]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: { name: 'values', type: 'bigint[]', primaryKey: false, notNull: false, default: "'{1,2,3}'" },
	});
});

test('array #4: boolean array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: boolean('values').array().default([true, false, true]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'boolean[]',
			primaryKey: false,
			notNull: false,
			default: "'{true,false,true}'",
		},
	});
});

test('array #5: multi-dimensional array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().array().default([[1, 2], [3, 4]]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'integer[][]',
			primaryKey: false,
			notNull: false,
			default: "'{{1,2},{3,4}}'",
		},
	});
});

test('array #6: date array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: date('values').array().default(['2024-08-06', '2024-08-07']),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'date[]',
			primaryKey: false,
			notNull: false,
			default: '\'{"2024-08-06","2024-08-07"}\'',
		},
	});
});

test('array #7: timestamp array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: timestamp('values').array().default([new Date('2024-08-06'), new Date('2024-08-07')]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'timestamp[]',
			primaryKey: false,
			notNull: false,
			default: '\'{"2024-08-06 00:00:00.000","2024-08-07 00:00:00.000"}\'',
		},
	});
});

test('array #8: json array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: json('values').array().default([{ a: 1 }, { b: 2 }]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'json[]',
			primaryKey: false,
			notNull: false,
			default: '\'{"{\\"a\\":1}","{\\"b\\":2}"}\'',
		},
	});
});

test('array #9: text array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: text('values').array().default(['abc', 'def']),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'text[]',
			primaryKey: false,
			notNull: false,
			default: '\'{"abc","def"}\'',
		},
	});
});

test('array #10: uuid array default', async (t) => {
	const from = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: uuid('values').array().default([
				'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
				'b0eebc99-9c0b-4ef8-bb6d-cbb9bd380a11',
			]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'uuid[]',
			primaryKey: false,
			notNull: false,
			default: '\'{"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11","b0eebc99-9c0b-4ef8-bb6d-cbb9bd380a11"}\'',
		},
	});
});

test('array #11: enum array default', async (t) => {
	const testEnum = pgEnum('test_enum', ['a', 'b', 'c']);

	const from = {
		enum: testEnum,
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		enum: testEnum,
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: testEnum('values').array().default(['a', 'b', 'c']),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'test_enum[]',
			primaryKey: false,
			notNull: false,
			default: '\'{"a","b","c"}\'',
			typeSchema: 'public',
		},
	});
});

test('array #12: enum empty array default', async (t) => {
	const testEnum = pgEnum('test_enum', ['a', 'b', 'c']);

	const from = {
		enum: testEnum,
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		enum: testEnum,
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: testEnum('values').array().default([]),
		}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'test',
		schema: '',
		column: {
			name: 'values',
			type: 'test_enum[]',
			primaryKey: false,
			notNull: false,
			default: "'{}'",
			typeSchema: 'public',
		},
	});
});
