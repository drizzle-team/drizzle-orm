import { eq, gt, gte, lt, lte, ne, sql } from 'drizzle-orm';
import { check, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { JsonCreateTableStatement } from 'src/jsonStatements';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('create table with check', async (t) => {
	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [
			{
				name: 'id',
				type: 'serial',
				notNull: true,
				primaryKey: true,
			},
			{
				name: 'age',
				type: 'integer',
				notNull: false,
				primaryKey: false,
			},
		],
		compositePKs: [],
		checkConstraints: ['some_check_name;"users"."age" > 21'],
		compositePkName: '',
		uniqueConstraints: [],
		isRLSEnabled: false,
		policies: [],
	} as JsonCreateTableStatement);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" serial PRIMARY KEY NOT NULL,
\t"age" integer,
\tCONSTRAINT "some_check_name" CHECK ("users"."age" > 21)
);\n`);
});

test('add check contraint to existing table', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_check_constraint',
		tableName: 'users',
		schema: '',
		data: 'some_check_name;"users"."age" > 21',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name" CHECK ("users"."age" > 21);`,
	);
});

test('drop check contraint in existing table', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}),
	};

	const { sqlStatements, statements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'delete_check_constraint',
		tableName: 'users',
		schema: '',
		constraintName: 'some_check_name',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`,
	);
});

test('rename check constraint', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => ({
			checkConstraint: check('new_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		constraintName: 'some_check_name',
		schema: '',
		tableName: 'users',
		type: 'delete_check_constraint',
	});
	expect(statements[1]).toStrictEqual({
		data: 'new_check_name;"users"."age" > 21',
		schema: '',
		tableName: 'users',
		type: 'create_check_constraint',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "users" ADD CONSTRAINT "new_check_name" CHECK ("users"."age" > 21);`,
	);
});

test('alter check constraint', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => ({
			checkConstraint: check('new_check_name', sql`${table.age} > 10`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		constraintName: 'some_check_name',
		schema: '',
		tableName: 'users',
		type: 'delete_check_constraint',
	});
	expect(statements[1]).toStrictEqual({
		data: 'new_check_name;"users"."age" > 10',
		schema: '',
		tableName: 'users',
		type: 'create_check_constraint',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "users" ADD CONSTRAINT "new_check_name" CHECK ("users"."age" > 10);`,
	);
});

test('alter multiple check constraints', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
			name: varchar('name'),
		}, (table) => ({
			checkConstraint1: check('some_check_name_1', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name_2', sql`${table.name} != 'Alex'`),
		})),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
			name: varchar('name'),
		}, (table) => ({
			checkConstraint1: check('some_check_name_3', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name_4', sql`${table.name} != 'Alex'`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(4);
	expect(statements[0]).toStrictEqual({
		constraintName: 'some_check_name_1',
		schema: '',
		tableName: 'users',
		type: 'delete_check_constraint',
	});
	expect(statements[1]).toStrictEqual({
		constraintName: 'some_check_name_2',
		schema: '',
		tableName: 'users',
		type: 'delete_check_constraint',
	});
	expect(statements[2]).toStrictEqual({
		data: 'some_check_name_3;"users"."age" > 21',
		schema: '',
		tableName: 'users',
		type: 'create_check_constraint',
	});
	expect(statements[3]).toStrictEqual({
		data: 'some_check_name_4;"users"."name" != \'Alex\'',
		schema: '',
		tableName: 'users',
		type: 'create_check_constraint',
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name_1";`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name_2";`,
	);
	expect(sqlStatements[2]).toBe(
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name_3" CHECK ("users"."age" > 21);`,
	);
	expect(sqlStatements[3]).toBe(
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name_4" CHECK ("users"."name" != \'Alex\');`,
	);
});

test('create checks with same names', async (t) => {
	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
			name: varchar('name'),
		}, (table) => ({
			checkConstraint1: check('some_check_name', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name', sql`${table.name} != 'Alex'`),
		})),
	};

	await expect(diffTestSchemas({}, to, [])).rejects.toThrowError();
});

test('create table with check constraint using operator functions', async (t) => {
  const to = {
    users: pgTable('users', {
      id: integer('id').primaryKey(),
      age: integer('age'),
      score: integer('score'),
      balance: integer('balance'),
    }, (table) => [
      // Test all comparison operators
      check('age_gt_18', gt(table.age, 18)),
      check('age_gte_18', gte(table.age, 18)),
      check('age_lt_100', lt(table.age, 100)),
      check('age_lte_99', lte(table.age, 99)),
      check('score_eq_100', eq(table.score, 100)),
      check('balance_ne_0', ne(table.balance, 0)),
      // For comparison with sql literal (should work the same)
      check('age_sql_gt_18', sql`${table.age} > 18`),
	]),
  };

  const { sqlStatements, statements } = await diffTestSchemas({}, to, []);

  expect(statements.length).toBe(1);
  expect(statements[0]).toStrictEqual({
    type: 'create_table',
    tableName: 'users',
    schema: '',
    columns: [
      {
        name: 'id',
        type: 'integer',
        notNull: true,
        primaryKey: true,
      },
      {
        name: 'age',
        type: 'integer',
        notNull: false,
        primaryKey: false,
      },
      {
        name: 'score',
        type: 'integer',
        notNull: false,
        primaryKey: false,
      },
      {
        name: 'balance',
        type: 'integer',
        notNull: false,
        primaryKey: false,
      },
    ],
    compositePKs: [],
    checkConstraints: [
      'age_gt_18;"users"."age" > 18',
      'age_gte_18;"users"."age" >= 18',
      'age_lt_100;"users"."age" < 100',
      'age_lte_99;"users"."age" <= 99',
      'score_eq_100;"users"."score" = 100',
      'balance_ne_0;"users"."balance" <> 0',
      'age_sql_gt_18;"users"."age" > 18',
    ],
    compositePkName: '',
    uniqueConstraints: [],
    isRLSEnabled: false,
    policies: [],
  });

  expect(sqlStatements.length).toBe(1);

  // The key test: all check constraints should contain literal values, not parameters
  const expectedSql = `CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL,
\t"age" integer,
\t"score" integer,
\t"balance" integer,
\tCONSTRAINT "age_gt_18" CHECK ("users"."age" > 18),
\tCONSTRAINT "age_gte_18" CHECK ("users"."age" >= 18),
\tCONSTRAINT "age_lt_100" CHECK ("users"."age" < 100),
\tCONSTRAINT "age_lte_99" CHECK ("users"."age" <= 99),
\tCONSTRAINT "score_eq_100" CHECK ("users"."score" = 100),
\tCONSTRAINT "balance_ne_0" CHECK ("users"."balance" <> 0),
\tCONSTRAINT "age_sql_gt_18" CHECK ("users"."age" > 18)
);
`;

  expect(sqlStatements[0]).toBe(expectedSql);

  // Verify that no parameterized placeholders ($1, $2, etc.) are in the output
  expect(sqlStatements[0]).not.toMatch(/\$\d+/);
});
