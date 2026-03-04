import { sql } from 'drizzle-orm';
import { check, int, mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';
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

test('create table with check', async (t) => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE TABLE \`users\` (
\t\`id\` serial PRIMARY KEY,
\t\`age\` int,
\tCONSTRAINT \`some_check_name\` CHECK(\`users\`.\`age\` > 21)
);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add check constraint to existing table #1', async (t) => {
	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements: st, next } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name\` CHECK (\`users\`.\`age\` > 21);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add check constraint to existing table #2', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}, (table) => [check('some_check1', sql`${table.values} < 100`), check('some_check2', sql`'test' < 100`)]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE \`test\` ADD CONSTRAINT \`some_check1\` CHECK (\`test\`.\`values\` < 100);',
		`ALTER TABLE \`test\` ADD CONSTRAINT \`some_check2\` CHECK ('test' < 100);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop check constraint in existing table #1', async (t) => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}),
	};

	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop check constraint in existing table #2', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}, (table) => [
			check('some_check1', sql`${table.values} < 100`),
			check('some_check2', sql`'test' < 100`),
		]),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE \`test\` DROP CONSTRAINT \`some_check1\`;',
		`ALTER TABLE \`test\` DROP CONSTRAINT \`some_check2\`;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename check constraint', async (t) => {
	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
		`ALTER TABLE \`users\` ADD CONSTRAINT \`new_check_name\` CHECK (\`users\`.\`age\` > 21);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter check constraint', async (t) => {
	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 10`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
		`ALTER TABLE \`users\` ADD CONSTRAINT \`new_check_name\` CHECK (\`users\`.\`age\` > 10);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter multiple check constraints', async (t) => {
	const from = {
		users: mysqlTable(
			'users',
			{
				id: serial('id').primaryKey(),
				age: int('age'),
				name: varchar('name', { length: 255 }),
			},
			(
				table,
			) => [
				check('some_check_name_1', sql`${table.age} > 21`),
				check('some_check_name_2', sql`${table.name} != 'Alex'`),
			],
		),
	};

	const to = {
		users: mysqlTable(
			'users',
			{
				id: serial('id').primaryKey(),
				age: int('age'),
				name: varchar('name', { length: 255 }),
			},
			(
				table,
			) => [
				check('some_check_name_3', sql`${table.age} > 21`),
				check('some_check_name_4', sql`${table.name} != 'Alex'`),
			],
		),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name_1\`;`,
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name_2\`;`,
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name_3\` CHECK (\`users\`.\`age\` > 21);`,
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name_4\` CHECK (\`users\`.\`name\` != \'Alex\');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create checks with same names', async (t) => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
			name: varchar('name', { length: 255 }),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
			check('some_check_name', sql`${table.name} != 'Alex'`),
		]),
	};

	await expect(diff({}, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

// TODO not possible to parse check definition
test.todo('create checks on serail or autoincrement', async (t) => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: serial(),
		}, (table) => [
			check('some_check_name1', sql`${table.column1} > 21`),
		]),
	};

	await expect(diff({}, schema1, [])).rejects.toThrowError();
	await expect(push({ db, to: schema1 })).rejects.toThrowError();

	const schema2 = {
		table1: mysqlTable('table1', {
			columnй: int().autoincrement(),
		}, (table) => [
			check('some_check_name2', sql`${table.columnй} > 21`),
		]),
	};

	await expect(diff({}, schema2, [])).rejects.toThrowError();
	await expect(push({ db, to: schema2 })).rejects.toThrowError();
});

test('db has checks. Push with same names', async () => {
	const schema1 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [
			check('some_check', sql`${table.values} < 100`),
		]),
	};
	const schema2 = {
		test: mysqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [
			check('some_check', sql`some new value`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
