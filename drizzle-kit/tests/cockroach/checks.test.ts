import { sql } from 'drizzle-orm';
import { check, cockroachTable, int4, varchar } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('create table with check', async ({ dbc: db }) => {
	const to = {
		users: cockroachTable('users', {
			age: int4('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"age" int4,\n\tCONSTRAINT "some_check_name" CHECK ("users"."age" > 21)\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('add check contraint to existing table', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			age: int4('age'),
		}),
	};

	const to = {
		users: cockroachTable('users', {
			age: int4('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE "users" ADD CONSTRAINT "some_check_name" CHECK ("users"."age" > 21);`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('drop check contraint in existing table', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			age: int4('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: cockroachTable('users', {
			age: int4('age'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('rename check constraint', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			age: int4('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: cockroachTable('users', {
			age: int4('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`,
		`ALTER TABLE "users" ADD CONSTRAINT "new_check_name" CHECK ("users"."age" > 21);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('alter check constraint', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable('users', {
			age: int4('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: cockroachTable('users', {
			age: int4('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 10`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "users" DROP CONSTRAINT "some_check_name";',
		'ALTER TABLE "users" ADD CONSTRAINT "some_check_name" CHECK ("users"."age" > 10);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});

test.concurrent('alter multiple check constraints', async ({ dbc: db }) => {
	const from = {
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
				age: int4('age'),
				name: varchar('name'),
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
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
				age: int4('age'),
				name: varchar('name'),
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

	const st0 = [
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name_1";`,
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name_2";`,
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name_3" CHECK ("users"."age" > 21);`,
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name_4" CHECK ("users"."name" != \'Alex\');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('create checks with same names', async ({ dbc: db }) => {
	const to = {
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
				age: int4('age'),
				name: varchar('name'),
			},
			(
				table,
			) => [check('some_check_name', sql`${table.age} > 21`), check('some_check_name', sql`${table.name} != 'Alex'`)],
		),
	};

	// 'constraint_name_duplicate'
	await expect(diff({}, to, [])).rejects.toThrow();
	// adding only CONSTRAINT "some_check_name" CHECK ("users"."age" > 21), not throwing error
	await expect(push({ db, to })).rejects.toThrow();
});

test.concurrent('db has checks. Push with same names', async ({ dbc: db }) => {
	const schema1 = {
		test: cockroachTable('test', {
			id: int4('id').primaryKey(),
			values: int4('values').default(1),
		}, (table) => [check('some_check', sql`${table.values} < 100`)]),
	};
	const schema2 = {
		test: cockroachTable('test', {
			id: int4('id').primaryKey(),
			values: int4('values').default(1),
		}, (table) => [check('some_check', sql`${table.values} > 100`)]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "test" DROP CONSTRAINT "some_check";',
		'ALTER TABLE "test" ADD CONSTRAINT "some_check" CHECK ("test"."values" > 100);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});

// The schema validation refuses two checks with the same name in one schema. Two tables of the old state hold
// the same name only between two renames that swap it. A check rename writes no SQL on cockroach, so the
// SQL of this diff cannot run on a server.
test.concurrent('check renames that swap a name between two tables keep the changes of both checks', async () => {
	const tables = (usersCheck: string, petsCheck: string, minimum: number) => ({
		users: cockroachTable('users', { age: int4() }, () => [check(usersCheck, sql.raw(`"age" > ${minimum}`))]),
		pets: cockroachTable('pets', { age: int4() }, () => [check(petsCheck, sql.raw(`"age" > ${minimum}`))]),
	});
	const renames = [
		'public.users.age_check->public.users.adult_check',
		'public.pets.adult_check->public.pets.age_check',
	];

	const { sqlStatements: st } = await diff(
		tables('age_check', 'adult_check', 0),
		tables('adult_check', 'age_check', 5),
		renames,
	);

	expect(st).toStrictEqual(expect.arrayContaining([
		'ALTER TABLE "users" DROP CONSTRAINT "adult_check";',
		'ALTER TABLE "users" ADD CONSTRAINT "adult_check" CHECK ("age" > 5);',
		'ALTER TABLE "pets" DROP CONSTRAINT "age_check";',
		'ALTER TABLE "pets" ADD CONSTRAINT "age_check" CHECK ("age" > 5);',
	]));
});
