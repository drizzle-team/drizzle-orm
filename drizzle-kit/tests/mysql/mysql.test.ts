import { sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	blob,
	boolean,
	char,
	customType,
	date,
	datetime,
	decimal,
	double,
	float,
	foreignKey,
	index,
	int,
	json,
	longblob,
	longtext,
	mediumblob,
	mediumint,
	mediumtext,
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	primaryKey,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyblob,
	tinyint,
	tinytext,
	unique,
	uniqueIndex,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

fs.mkdirSync('./tests/mysql/migrations', { recursive: true });

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];
let client: TestDatabase['client'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
	client = _.client;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('add table #1', async () => {
	const to = {
		users: mysqlTable('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['CREATE TABLE `users` (\n\t`id` int\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #2', async () => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` serial PRIMARY KEY\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #3', async () => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id'),
			test: varchar('test', { length: 1 }),
		}, (t) => [
			primaryKey({
				columns: [t.id, t.test],
			}),
		]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` serial,\n\t`test` varchar(1),\n\tCONSTRAINT `PRIMARY` PRIMARY KEY(`id`,`test`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #4', async () => {
	const to = {
		users: mysqlTable('users', { id: int() }),
		posts: mysqlTable('posts', { id: int() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
		'CREATE TABLE `posts` (\n\t`id` int\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #5', async () => {
	const schema = mysqlSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #6', async () => {
	const from = {
		users1: mysqlTable('users1', { id: int() }),
	};

	const to = {
		users2: mysqlTable('users2', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users2` (\n\t`id` int\n);\n',
		'DROP TABLE `users1`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3539
test('add table #7', async () => {
	const from = {
		users1: mysqlTable('users1', { id: int() }),
	};

	const to = {
		users: mysqlTable('users', { id: int() }),
		users2: mysqlTable('users2', { id: int() }),
	};

	const renames = ['users1->users2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
		'RENAME TABLE `users1` TO `users2`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2599
test('drop + add table', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
			column2: int(),
		}, (table) => [
			index('unique-index1').on(table.column2),
		]),
	};

	const schema2 = {
		table2: mysqlTable('table2', {
			column1: int().primaryKey(),
			column2: int(),
		}, (table) => [
			index('unique-index2').on(table.column2),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int PRIMARY KEY,\n\t`column2` int\n);\n',
		'CREATE INDEX `unique-index1` ON `table1` (`column2`);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2 = [
		'CREATE TABLE `table2` (\n\t`column1` int PRIMARY KEY,\n\t`column2` int\n);\n',
		'DROP TABLE `table1`;',
		'CREATE INDEX `unique-index2` ON `table2` (`column2`);',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4456
test('drop tables with fk constraint', async () => {
	const table1 = mysqlTable('table1', {
		column1: int().primaryKey(),
	});
	const table2 = mysqlTable('table2', {
		column1: int().primaryKey(),
		column2: int().references(() => table1.column1),
	});
	const schema1 = { table1, table2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int PRIMARY KEY\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int PRIMARY KEY,\n\t`column2` int\n);\n',
		'ALTER TABLE \`table2\` ADD CONSTRAINT `table2_column2_table1_column1_fkey` FOREIGN KEY (`column2`) REFERENCES `table1`(`column1`);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, {}, []);
	const { sqlStatements: pst2 } = await push({ db, to: {} });

	const expectedSt2 = [
		'ALTER TABLE `table2` DROP CONSTRAINT `table2_column2_table1_column1_fkey`;',
		'DROP TABLE `table1`;',
		'DROP TABLE `table2`;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('add schema + table #1', async () => {
	const schema = mysqlSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change schema with tables #1', async () => {
	const schema = mysqlSchema('folder');
	const schema2 = mysqlSchema('folder2');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema2,
		users: schema2.table('users', {}),
	};

	const renames = ['folder->folder2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #1', async () => {
	const schema = mysqlSchema('folder');
	const from = {
		schema,
		users: mysqlTable('users', { id: int() }),
	};
	const to = {
		schema,
		users: schema.table('users', { id: int() }),
	};

	const renames = ['users->folder.users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['DROP TABLE `users`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #2', async () => {
	const schema = mysqlSchema('folder');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema,
		users: mysqlTable('users', { id: int() }),
	};

	const renames = ['folder.users->users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['CREATE TABLE `users` (\n\t`id` int\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #3', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
	const from = {
		schema1,
		schema2,
		users: schema1.table('users', {}),
	};
	const to = {
		schema1,
		schema2,
		users: schema2.table('users', {}),
	};

	const renames = ['folder1.users->folder2.users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #4', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema1,
		schema2, // add schema
		users: schema2.table('users', {}), // move table
	};

	const renames = ['folder1.users->folder2.users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #5', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
	const from = {
		schema1, // remove schema
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // add schema
		users: schema2.table('users', {}), // move table
	};

	const renames = ['folder1.users->folder2.users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #5', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
	const from = {
		schema1,
		schema2,
		users: schema1.table('users', {}),
	};
	const to = {
		schema1,
		schema2,
		users: schema2.table('users2', {}), // rename and move table
	};

	const renames = ['folder1.users->folder2.users2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #6', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', { id: int() }),
	};
	const to = {
		schema2, // rename schema
		users: schema2.table('users2', { id: int() }), // rename table
	};

	const renames = ['folder1->folder2', 'folder2.users->folder2.users2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #10', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({}),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('{}')\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #11', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default([]),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('[]')\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #12', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default([1, 2, 3]),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('[1,2,3]')\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #13', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({ key: 'value' }),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`json` json DEFAULT (\'{"key":"value"}\')\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #14', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({
				key: 'value',
				arr: [1, 2, 3],
			}),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`json` json DEFAULT (\'{"key":"value","arr":[1,2,3]}\')\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/472
// https://github.com/drizzle-team/drizzle-orm/issues/3373
test('add table #15. timestamp + fsp + default now + on update now + fsp', async () => {
	// TODO: revise: maybe .onUpdateNow should be able to get fsp from timestamp config.
	// Because fsp in timestamp config and onUpdateNow config should be the same for query to run successfully.
	// It might also be helpfull to add fsp field to .defaultNow config,
	// since setting now() as default without specifying fsp caused an error on PlanetScale (issue 472).
	const to = {
		users: mysqlTable('table', {
			createdAt: timestamp({ fsp: 4 }).defaultNow().onUpdateNow({ fsp: 4 }),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`createdAt` timestamp(4) DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP(4)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #16. timestamp + on update now + fsp', async () => {
	const to = {
		users: mysqlTable('table', {
			createdAt: timestamp().onUpdateNow({ fsp: 4 }),
		}),
	};

	// TODO: revise: shouldn't diff also throw an error?
	const { sqlStatements: st } = await diff({}, to, []);

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`createdAt` timestamp ON UPDATE CURRENT_TIMESTAMP(4)\n);\n',
	];

	expect(st).toStrictEqual(st0);
	await expect(push({ db, to })).rejects.toThrowError();
});

test('add table #17. timestamp + fsp + on update now', async () => {
	const to = {
		users: mysqlTable('table', {
			createdAt: timestamp({ fsp: 4 }).onUpdateNow(),
		}),
	};

	// TODO: revise: shouldn't diff also throw an error?
	const { sqlStatements: st } = await diff({}, to, []);

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`createdAt` timestamp(4) ON UPDATE CURRENT_TIMESTAMP\n);\n',
	];

	expect(st).toStrictEqual(st0);
	await expect(push({ db, to })).rejects.toThrowError();
});

// https://github.com/drizzle-team/drizzle-orm/issues/2180
test('add table #18. serial + primary key, timestamp + default with sql``', async () => {
	const to = {
		table1: mysqlTable('table1', {
			column1: serial().primaryKey(),
			column2: timestamp().notNull().default(sql`CURRENT_TIMESTAMP`),
		}),
	};

	// TODO: revise: the sql`` passed to .default() may not need parentheses
	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });
	const expectedSt = [
		'CREATE TABLE `table1` (\n\t`column1` serial PRIMARY KEY,\n\t`column2` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n',
	];
	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);
});

test('add table #19. timestamp + default with sql``', async () => {
	const to = {
		table1: mysqlTable('table1', {
			column1: timestamp().notNull().defaultNow().onUpdateNow(),
			column2: timestamp().notNull().default(sql`(CURRENT_TIMESTAMP)`).onUpdateNow(),
			// column3: timestamp().notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
		}),
	};

	// TODO: revise: the sql`` passed to .default() may not need parentheses
	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });
	const expectedSt = [
		'CREATE TABLE `table1` (\n\t'
		+ '`column1` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,\n\t'
		+ '`column2` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP\n);\n',
	];
	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2599
// https://github.com/drizzle-team/drizzle-orm/issues/3359
// https://github.com/drizzle-team/drizzle-orm/issues/1413
// https://github.com/drizzle-team/drizzle-orm/issues/3473
// https://github.com/drizzle-team/drizzle-orm/issues/2815
test('add table #20. table already exists; multiple pk defined', async () => {
	const schema = {
		table1: mysqlTable('table1', {
			column1: int().autoincrement().primaryKey(),
			column2: varchar({ length: 256 }).notNull().unique(),
		}),
		table2: mysqlTable('table2', {
			column1: int().autoincrement(),
		}, (table) => [
			primaryKey({ columns: [table.column1] }),
		]),
		table3: mysqlTable('table3', {
			column1: int(),
			column2: int(),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2] }),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int AUTO_INCREMENT PRIMARY KEY,\n\t`column2` varchar(256) NOT NULL,'
		+ '\n\tCONSTRAINT `column2_unique` UNIQUE INDEX(`column2`)\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int AUTO_INCREMENT PRIMARY KEY\n);\n',
		'CREATE TABLE `table3` (\n\t`column1` int,\n\t`column2` int,\n\t'
		+ 'CONSTRAINT `PRIMARY` PRIMARY KEY(`column1`,`column2`)\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });

	const expectedSt2: string[] = [];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/1742
test('add table #21. table with hyphen in identifiers', async () => {
	const schema1 = {
		'table-1': mysqlTable('table-1', {
			'column-1': int('column-1'),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table-1` (\n\t`column-1` int\n);\n',
	];

	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		'table-1': mysqlTable('table-1', {
			'column-1': int('column-1').notNull(),
		}),
	};
	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE `table-1` MODIFY COLUMN `column-1` int NOT NULL;',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/818
test('add table #22. custom type; default', async () => {
	interface Semver {
		major: number;
		minor: number;
		patch: number;
	}
	const semver = customType<{
		data: Semver;
		driverData: string;
		config: { length: number };
		configRequired: true;
	}>({
		dataType(config) {
			return `varchar(${config.length})`;
		},
		fromDriver(value: string): Semver {
			const [major, minor, patch] = value.split('.');
			if (!major || !minor || !patch) {
				throw new Error(`Invalid semver: ${value}`);
			}
			return {
				major: parseInt(major),
				minor: parseInt(minor),
				patch: parseInt(patch),
			};
		},
		toDriver(value: Semver): string {
			return `${value.major}.${value.minor}.${value.patch}`;
		},
	});
	const schema = {
		table1: mysqlTable('table1', {
			column1: semver({ length: 12 }).default({ major: 0, minor: 0, patch: 0 }),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });
	const expectedSt1 = [
		"CREATE TABLE `table1` (\n\t`column1` varchar(12) DEFAULT '0.0.0'\n);\n",
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });

	const expectedSt2: string[] = [];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/364
test('add column #1. timestamp + fsp + on update now + fsp', async () => {
	const from = {
		users: mysqlTable('table', {
			id: int(),
		}),
	};
	const to = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp({ fsp: 4 }).onUpdateNow({ fsp: 4 }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` ADD `createdAt` timestamp(4) ON UPDATE CURRENT_TIMESTAMP(4);',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add column #2. timestamp + on update now + fsp', async () => {
	const from = {
		users: mysqlTable('table', {
			id: int(),
		}),
	};
	const to = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp().onUpdateNow({ fsp: 4 }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });

	const st0: string[] = [
		'ALTER TABLE `table` ADD `createdAt` timestamp ON UPDATE CURRENT_TIMESTAMP(4);',
	];

	expect(st).toStrictEqual(st0);
	await expect(push({ db, to })).rejects.toThrowError();
});

test('add column #3. timestamp + fsp + on update now', async () => {
	const from = {
		users: mysqlTable('table', {
			id: int(),
		}),
	};
	const to = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp({ fsp: 4 }).onUpdateNow(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });

	const st0: string[] = [
		'ALTER TABLE `table` ADD `createdAt` timestamp(4) ON UPDATE CURRENT_TIMESTAMP;',
	];

	expect(st).toStrictEqual(st0);
	await expect(push({ db, to })).rejects.toThrowError();
});

test('modify on update now fsp #1', async () => {
	const from = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp({ fsp: 4 }).onUpdateNow({ fsp: 4 }),
		}),
	};
	const to = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp().onUpdateNow(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	const { sqlStatements: pst } = await diff(from, to, []);

	const st0: string[] = [
		'ALTER TABLE `table` MODIFY COLUMN `createdAt` timestamp ON UPDATE CURRENT_TIMESTAMP;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('modify on update now fsp #2', async () => {
	const from = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp().onUpdateNow(),
		}),
	};
	const to = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp({ fsp: 4 }).onUpdateNow({ fsp: 4 }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` MODIFY COLUMN `createdAt` timestamp(4) ON UPDATE CURRENT_TIMESTAMP(4);',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('modify on update now fsp #3', async () => {
	const from = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp({ fsp: 2 }).onUpdateNow({ fsp: 2 }),
		}),
	};
	const to = {
		users: mysqlTable('table', {
			id: int(),
			createdAt: timestamp({ fsp: 4 }).onUpdateNow({ fsp: 4 }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` MODIFY COLUMN `createdAt` timestamp(4) ON UPDATE CURRENT_TIMESTAMP(4);',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/998
test('drop index', async () => {
	const from = {
		users: mysqlTable('table', {
			name: varchar({ length: 10 }),
		}, (t) => [
			index('name_idx').on(t.name),
		]),
	};

	const to = {
		users: mysqlTable('table', {
			name: varchar({ length: 10 }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['DROP INDEX `name_idx` ON `table`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop unique constraint', async () => {
	const from = {
		users: mysqlTable('table', {
			name: varchar({ length: 10 }),
		}, (t) => [unique('name_uq').on(t.name)]),
	};

	const to = {
		users: mysqlTable('table', {
			name: varchar({ length: 10 }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'DROP INDEX `name_uq` ON `table`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/1888
test('add table with indexes', async () => {
	const from = {};

	const to = {
		users: mysqlTable('users', {
			id: serial().primaryKey(),
			name: varchar({ length: 100 }),
			email: varchar({ length: 100 }),
			column4: varchar({ length: 100 }),
		}, (t) => [
			uniqueIndex('uniqueExpr').on(sql`(lower(${t.email}))`),
			index('indexExpr').on(sql`(lower(${t.email}))`),
			index('indexExprMultiple').on(sql`(lower(${t.email}))`, sql`(lower(${t.email}))`),
			uniqueIndex('uniqueCol').on(t.email),
			index('indexCol').on(t.email),
			index('indexColMultiple').on(t.email, t.name),
			index('indexColExpr').on(sql`(lower(${t.email}))`, t.email),
			index('indexCol4Hash').on(sql`(lower(${t.column4}))`).using('hash'),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE TABLE \`users\` (\n\t\`id\` serial PRIMARY KEY,`
		+ `\n\t\`name\` varchar(100),\n\t\`email\` varchar(100),\n\t\`column4\` varchar(100),`
		+ `\n\tCONSTRAINT \`uniqueExpr\` UNIQUE INDEX((lower(\`email\`))),\n\tCONSTRAINT \`uniqueCol\` UNIQUE INDEX(\`email\`)\n);\n`,
		'CREATE INDEX `indexExpr` ON `users` ((lower(`email`)));',
		'CREATE INDEX `indexExprMultiple` ON `users` ((lower(`email`)),(lower(`email`)));',
		'CREATE INDEX `indexCol` ON `users` (`email`);',
		'CREATE INDEX `indexColMultiple` ON `users` (`email`,`name`);',
		'CREATE INDEX `indexColExpr` ON `users` ((lower(`email`)),`email`);',
		'CREATE INDEX `indexCol4Hash` ON `users` ((lower(`column4`)));',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2122
test('varchar and text default values escape single quotes', async (t) => {
	const schema1 = {
		table: mysqlTable('table', {
			id: serial('id').primaryKey(),
		}),
	};

	const schema2 = {
		table: mysqlTable('table', {
			id: serial('id').primaryKey(),
			enum: mysqlEnum('enum', ["escape's quotes", "escape's quotes 2"]).default("escape's quotes"),
			text: text('text').default("escape's quotes"),
			varchar: varchar('varchar', { length: 255 }).default("escape's quotes"),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		"ALTER TABLE `table` ADD `enum` enum('escape''s quotes','escape''s quotes 2') DEFAULT 'escape''s quotes';",
		"ALTER TABLE `table` ADD `text` text DEFAULT ('escape''s quotes');",
		"ALTER TABLE `table` ADD `varchar` varchar(255) DEFAULT 'escape''s quotes';",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('default on serail', async (t) => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: serial().default(1),
		}),
	};

	const { ddl1Err, ddl2Err, mappedErrors1, mappedErrors2 } = await diff({}, schema1, []);
	expect(ddl1Err).toStrictEqual([]);
	expect(ddl2Err).toStrictEqual([
		{
			column: 'column1',
			table: 'table1',
			type: 'column_unsupported_default_on_autoincrement',
		},
	]);
	await expect(push({ db, to: schema1 })).rejects.toThrowError();
});

test('default on autoincrement', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int().autoincrement().default(1),
		}),
	};

	const { ddl1Err, ddl2Err, mappedErrors1, mappedErrors2 } = await diff({}, schema1, []);
	expect(ddl1Err).toStrictEqual([]);
	expect(ddl2Err).toStrictEqual([
		{
			column: 'column1',
			table: 'table1',
			type: 'column_unsupported_default_on_autoincrement',
		},
	]);
	await expect(push({ db, to: schema1 })).rejects.toThrowError();
});

test('composite primary key #1', async () => {
	const from = {};
	const to = {
		table: mysqlTable('works_to_creators', {
			workId: int().notNull(),
			creatorId: int().notNull(),
			classification: varchar({ length: 10 }).notNull(),
		}, (t) => [
			primaryKey({
				columns: [t.workId, t.creatorId, t.classification],
			}),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `works_to_creators` (\n\t`workId` int NOT NULL,\n\t`creatorId` int NOT NULL,\n\t`classification` varchar(10) NOT NULL,\n\tCONSTRAINT `PRIMARY` PRIMARY KEY(`workId`,`creatorId`,`classification`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('composite primary key #2', async () => {
	const schema1 = {};

	const schema2 = {
		table: mysqlTable('table', {
			col1: int('col1').notNull(),
			col2: int('col2').notNull(),
		}, (t) => [
			primaryKey({
				columns: [t.col1, t.col2],
			}),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`col1` int NOT NULL,\n\t`col2` int NOT NULL,\n\tCONSTRAINT `PRIMARY` PRIMARY KEY(`col1`,`col2`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename table with composite primary key', async () => {
	const productsCategoriesTable = (tableName: string) => {
		return mysqlTable(tableName, {
			productId: varchar('product_id', { length: 10 }).notNull(),
			categoryId: varchar('category_id', { length: 10 }).notNull(),
		}, (t) => [
			primaryKey({
				columns: [t.productId, t.categoryId],
			}),
		]);
	};

	const schema1 = {
		table: productsCategoriesTable('products_categories'),
	};
	const schema2 = {
		test: productsCategoriesTable('products_to_categories'),
	};

	const renames = ['products_categories->products_to_categories'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'RENAME TABLE `products_categories` TO `products_to_categories`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/367
test('optional db aliases (snake case)', async () => {
	const from = {};

	const t1 = mysqlTable('t1', {
		t1Id1: int().notNull().primaryKey(),
		t1Col2: int().notNull(),
		t1Col3: int().notNull(),
		t2Ref: bigint({ mode: 'number', unsigned: true }).references(() => t2.t2Id),
		t1Uni: int().notNull(),
		t1UniIdx: int().notNull(),
		t1Idx: int().notNull(),
	}, (table) => [
		unique('t1_uni').on(table.t1Uni),
		uniqueIndex('t1_uni_idx').on(table.t1UniIdx),
		index('t1_idx').on(table.t1Idx),
		foreignKey({
			columns: [table.t1Col2, table.t1Col3],
			foreignColumns: [t3.t3Id1, t3.t3Id2],
		}),
	]);

	const t2 = mysqlTable('t2', {
		t2Id: serial().primaryKey(),
	});

	const t3 = mysqlTable('t3', {
		t3Id1: int(),
		t3Id2: int(),
	}, (table) => [primaryKey({
		columns: [table.t3Id1, table.t3Id2],
	})]);

	const to = { t1, t2, t3 };

	const casing = 'snake_case';
	const { sqlStatements: st } = await diff(from, to, [], casing);
	const { sqlStatements: pst } = await push({ db, to, casing });

	const st0: string[] = [
		`CREATE TABLE \`t1\` (
	\`t1_id1\` int PRIMARY KEY,
	\`t1_col2\` int NOT NULL,
	\`t1_col3\` int NOT NULL,
	\`t2_ref\` bigint unsigned,
	\`t1_uni\` int NOT NULL,
	\`t1_uni_idx\` int NOT NULL,
	\`t1_idx\` int NOT NULL,
	CONSTRAINT \`t1_uni\` UNIQUE INDEX(\`t1_uni\`),
	CONSTRAINT \`t1_uni_idx\` UNIQUE INDEX(\`t1_uni_idx\`)
);\n`,
		`CREATE TABLE \`t2\` (\n\t\`t2_id\` serial PRIMARY KEY\n);\n`,
		`CREATE TABLE \`t3\` (
	\`t3_id1\` int,
	\`t3_id2\` int,
	CONSTRAINT \`PRIMARY\` PRIMARY KEY(\`t3_id1\`,\`t3_id2\`)
);\n`,
		`CREATE INDEX \`t1_idx\` ON \`t1\` (\`t1_idx\`);`,
		'ALTER TABLE `t1` ADD CONSTRAINT `t1_t2_ref_t2_t2_id_fkey` FOREIGN KEY (`t2_ref`) REFERENCES `t2`(`t2_id`);',
		'ALTER TABLE `t1` ADD CONSTRAINT `t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fkey` FOREIGN KEY (`t1_col2`,`t1_col3`) REFERENCES `t3`(`t3_id1`,`t3_id2`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('optional db aliases (camel case)', async () => {
	const from = {};

	const t1 = mysqlTable('t1', {
		t1_id1: int().notNull().primaryKey(),
		t1_col2: int().notNull(),
		t1_col3: int().notNull(),
		t2_ref: bigint({ mode: 'number', unsigned: true }).references(() => t2.t2_id),
		t1_uni: int().notNull(),
		t1_uni_idx: int().notNull(),
		t1_idx: int().notNull(),
	}, (table) => [
		unique('t1Uni').on(table.t1_uni),
		uniqueIndex('t1UniIdx').on(table.t1_uni_idx),
		index('t1Idx').on(table.t1_idx),
		foreignKey({
			columns: [table.t1_col2, table.t1_col3],
			foreignColumns: [t3.t3_id1, t3.t3_id2],
		}),
	]);

	const t2 = mysqlTable('t2', {
		t2_id: serial().primaryKey(),
	});

	const t3 = mysqlTable('t3', {
		t3_id1: int(),
		t3_id2: int(),
	}, (table) => [primaryKey({
		columns: [table.t3_id1, table.t3_id2],
	})]);

	const to = {
		t1,
		t2,
		t3,
	};

	const casing = 'camelCase';
	const { sqlStatements: st } = await diff(from, to, [], casing);
	const { sqlStatements: pst } = await push({ db, to, casing });

	const st0: string[] = [
		`CREATE TABLE \`t1\` (\n\t\`t1Id1\` int PRIMARY KEY,\n\t\`t1Col2\` int NOT NULL,\n\t\`t1Col3\` int NOT NULL,\n`
		+ `\t\`t2Ref\` bigint unsigned,\n\t\`t1Uni\` int NOT NULL,\n\t\`t1UniIdx\` int NOT NULL,\n\t\`t1Idx\` int NOT NULL,\n`
		+ `\tCONSTRAINT \`t1Uni\` UNIQUE INDEX(\`t1Uni\`),\n`
		+ `\tCONSTRAINT \`t1UniIdx\` UNIQUE INDEX(\`t1UniIdx\`)\n`
		+ `);\n`,
		`CREATE TABLE \`t2\` (\n\t\`t2Id\` serial PRIMARY KEY\n);\n`,
		`CREATE TABLE \`t3\` (\n\t\`t3Id1\` int,\n\t\`t3Id2\` int,\n\tCONSTRAINT \`PRIMARY\` PRIMARY KEY(\`t3Id1\`,\`t3Id2\`)\n);\n`,
		'CREATE INDEX `t1Idx` ON `t1` (`t1Idx`);',
		'ALTER TABLE `t1` ADD CONSTRAINT `t1_t2Ref_t2_t2Id_fkey` FOREIGN KEY (`t2Ref`) REFERENCES `t2`(`t2Id`);',
		'ALTER TABLE `t1` ADD CONSTRAINT `t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fkey` FOREIGN KEY (`t1Col2`,`t1Col3`) REFERENCES `t3`(`t3Id1`,`t3Id2`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add+drop unique', async () => {
	const state0 = {};
	const state1 = {
		users: mysqlTable('users', {
			id: int().unique(),
		}),
	};
	const state2 = {
		users: mysqlTable('users', {
			id: int(),
		}),
	};

	// TODO: should I rewrite this test as multistep test?
	// const { sqlStatements: st1, next: n1 } = await diff(state0, state1, []);
	const { sqlStatements: st1 } = await diff(state0, state1, []);
	const { sqlStatements: pst1 } = await push({ db, to: state1 });

	const { sqlStatements: st2 } = await diff(state1, state2, []);
	const { sqlStatements: pst2 } = await push({ db, to: state2 });

	const st01: string[] = [
		'CREATE TABLE `users` (\n\t`id` int,\n\tCONSTRAINT `id_unique` UNIQUE INDEX(`id`)\n);\n',
	];
	expect(st1).toStrictEqual(st01);
	expect(pst1).toStrictEqual(st01);

	const st02: string[] = [
		'DROP INDEX `id_unique` ON `users`;',
	];
	expect(st2).toStrictEqual(st02);
	expect(pst2).toStrictEqual(st02);
});

test('fk #1', async () => {
	const users = mysqlTable('users', {
		id: int().unique(),
	});
	const to = {
		users,
		places: mysqlTable('places', {
			id: int(),
			ref: int().references(() => users.id),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` int,\n\tCONSTRAINT `id_unique` UNIQUE INDEX(`id`)\n);\n',
		'CREATE TABLE `places` (\n\t`id` int,\n\t`ref` int\n);\n',
		'ALTER TABLE `places` ADD CONSTRAINT `places_ref_users_id_fkey` FOREIGN KEY (`ref`) REFERENCES `users`(`id`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/367
test('fk #2', async () => {
	const table1 = mysqlTable('table1', {
		column1: serial().primaryKey(),
	});
	const to = {
		table1,
		table2: mysqlTable('table2', {
			column1: serial().primaryKey(),
			column2: bigint({ mode: 'number', unsigned: true }).references(() => table1.column1).notNull(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `table1` (\n\t`column1` serial PRIMARY KEY\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` serial PRIMARY KEY,\n\t`column2` bigint unsigned NOT NULL\n);\n',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_column2_table1_column1_fkey` FOREIGN KEY (`column2`) REFERENCES `table1`(`column1`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table with ts enum', async () => {
	enum Test {
		value = 'value',
	}
	const to = {
		users: mysqlTable('users', {
			enum: mysqlEnum(Test),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ["CREATE TABLE `users` (\n\t`enum` enum('value')\n);\n"];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('all types', async () => {
	const schema1 = {
		allBigInts: mysqlTable('all_big_ints', {
			simple: bigint('simple', { mode: 'number' }),
			columnNotNull: bigint('column_not_null', { mode: 'number' }).notNull(),
			columnDefault: bigint('column_default', { mode: 'number' }).default(12),
			columnDefaultSql: bigint('column_default_sql', { mode: 'number' }).default(12),
		}),
		allBools: mysqlTable('all_bools', {
			simple: tinyint('simple'),
			columnNotNull: tinyint('column_not_null').notNull(),
			columnDefault: tinyint('column_default').default(1),
		}),
		allChars: mysqlTable('all_chars', {
			simple: char('simple', { length: 1 }),
			columnNotNull: char('column_not_null', { length: 45 }).notNull(),
			// columnDefault: char("column_default", { length: 1 }).default("h"),
			columnDefaultSql: char('column_default_sql', { length: 1 }).default('h'),
		}),
		allDateTimes: mysqlTable('all_date_times', {
			simple: datetime('simple', { mode: 'string', fsp: 1 }),
			columnNotNull: datetime('column_not_null', { mode: 'string' }).notNull(),
			columnDefault: datetime('column_default', { mode: 'string' }).default('2023-03-01 14:05:29'),
		}),
		allDates: mysqlTable('all_dates', {
			simple: date('simple', { mode: 'string' }),
			column_not_null: date('column_not_null', { mode: 'string' }).notNull(),
			column_default: date('column_default', { mode: 'string' }).default('2023-03-01'),
		}),
		allDecimals: mysqlTable('all_decimals', {
			simple: decimal('simple', { precision: 1, scale: 0 }),
			columnNotNull: decimal('column_not_null', { precision: 45, scale: 3 }).notNull(),
			columnDefault: decimal('column_default', { precision: 10, scale: 0 }).default('100'),
			columnDefaultSql: decimal('column_default_sql', { precision: 10, scale: 0 }).default('101'),
		}),

		allDoubles: mysqlTable('all_doubles', {
			simple: double('simple'),
			columnNotNull: double('column_not_null').notNull(),
			columnDefault: double('column_default').default(100),
			columnDefaultSql: double('column_default_sql').default(101),
		}),

		allEnums: mysqlTable('all_enums', {
			simple: mysqlEnum('simple', ['hi', 'hello']),
		}),

		allEnums1: mysqlTable('all_enums1', {
			simple: mysqlEnum('simple', ['hi', 'hello']).default('hi'),
		}),

		allFloats: mysqlTable('all_floats', {
			columnNotNull: float('column_not_null').notNull(),
			columnDefault: float('column_default').default(100),
			columnDefaultSql: float('column_default_sql').default(101),
		}),

		allInts: mysqlTable('all_ints', {
			simple: int('simple'),
			columnNotNull: int('column_not_null').notNull(),
			columnDefault: int('column_default').default(100),
			columnDefaultSql: int('column_default_sql').default(101),
		}),

		allIntsRef: mysqlTable('all_ints_ref', {
			simple: int('simple'),
			columnNotNull: int('column_not_null').notNull(),
			columnDefault: int('column_default').default(100),
			columnDefaultSql: int('column_default_sql').default(101),
		}),

		allJsons: mysqlTable('all_jsons', {
			columnDefaultObject: json('column_default_object').default({ hello: 'world world' }).notNull(),
			columnDefaultArray: json('column_default_array').default({
				hello: { 'world world': ['foo', 'bar'] },
				foo: 'bar',
				fe: 23,
			}),
			column: json('column'),
		}),

		allMInts: mysqlTable('all_m_ints', {
			simple: mediumint('simple'),
			columnNotNull: mediumint('column_not_null').notNull(),
			columnDefault: mediumint('column_default').default(100),
			columnDefaultSql: mediumint('column_default_sql').default(101),
		}),

		allReals: mysqlTable('all_reals', {
			simple: double('simple', { precision: 5, scale: 2 }),
			columnNotNull: double('column_not_null').notNull(),
			columnDefault: double('column_default').default(100),
			columnDefaultSql: double('column_default_sql').default(101),
		}),

		allSInts: mysqlTable('all_s_ints', {
			simple: smallint('simple'),
			columnNotNull: smallint('column_not_null').notNull(),
			columnDefault: smallint('column_default').default(100),
			columnDefaultSql: smallint('column_default_sql').default(101),
		}),

		allSmallSerials: mysqlTable('all_small_serials', {
			columnAll: serial('column_all').primaryKey().notNull(),
		}),

		allTInts: mysqlTable('all_t_ints', {
			simple: tinyint('simple'),
			columnNotNull: tinyint('column_not_null').notNull(),
			columnDefault: tinyint('column_default').default(10),
			columnDefaultSql: tinyint('column_default_sql').default(11),
		}),

		allTexts: mysqlTable('all_texts', {
			simple: text('simple'),
			columnNotNull: text('column_not_null').notNull(),
			columnDefault: text('column_default').default('hello'),
			columnDefaultSql: text('column_default_sql').default('hello'),
		}),

		allTimes: mysqlTable('all_times', {
			simple: time('simple', { fsp: 1 }),
			columnNotNull: time('column_not_null').notNull(),
			columnDefault: time('column_default').default('22:12:12'),
		}),

		allTimestamps: mysqlTable('all_timestamps', {
			columnDateNow: timestamp('column_date_now', { fsp: 1, mode: 'string' }).default(sql`(now())`),
			columnAll: timestamp('column_all', { mode: 'string' })
				.default('2023-03-01 14:05:29')
				.notNull(),
			column: timestamp('column', { mode: 'string' }).default('2023-02-28 16:18:31'),
		}),

		allVarChars: mysqlTable('all_var_chars', {
			simple: varchar('simple', { length: 100 }),
			columnNotNull: varchar('column_not_null', { length: 45 }).notNull(),
			columnDefault: varchar('column_default', { length: 100 }).default('hello'),
			columnDefaultSql: varchar('column_default_sql', { length: 100 }).default('hello'),
		}),

		allVarbinaries: mysqlTable('all_varbinaries', {
			simple: varbinary('simple', { length: 100 }),
			columnNotNull: varbinary('column_not_null', { length: 100 }).notNull(),
			columnDefault: varbinary('column_default', { length: 12 }).default(sql`(uuid_to_bin(uuid()))`),
		}),

		allYears: mysqlTable('all_years', {
			simple: year('simple'),
			columnNotNull: year('column_not_null').notNull(),
			columnDefault: year('column_default').default(2022),
		}),

		binafry: mysqlTable('binary', {
			simple: binary('simple', { length: 1 }),
			columnNotNull: binary('column_not_null', { length: 1 }).notNull(),
			columnDefault: binary('column_default', { length: 12 }).default(sql`(uuid_to_bin(uuid()))`),
		}),

		allTinyBlobs: mysqlTable('all_tiny_blobs', {
			simple: tinyblob('simple'),
			columnNotNull: tinyblob('column_not_null').notNull(),
			columnDefault: tinyblob('column_default').default(Buffer.from('hello')),
			columnDefaultSql: tinyblob('column_default_sql').default(sql`'hello'`),
			stringSimple: tinyblob('string_simple', { mode: 'string' }),
			stringColumnNotNull: tinyblob('string_column_not_null', { mode: 'string' }).notNull(),
			stringColumnDefault: tinyblob('string_column_default', { mode: 'string' }).default('hello'),
			stringColumnDefaultSql: tinyblob('string_column_default_sql', { mode: 'string' }).default(sql`'hello'`),
		}),
		allBlobs: mysqlTable('all_blobs', {
			simple: blob('simple'),
			columnNotNull: blob('column_not_null').notNull(),
			columnDefault: blob('column_default').default(Buffer.from('hello')),
			columnDefaultSql: blob('column_default_sql').default(sql`'hello'`),
			stringSimple: blob('string_simple', { mode: 'string' }),
			stringColumnNotNull: blob('string_column_not_null', { mode: 'string' }).notNull(),
			stringColumnDefault: blob('string_column_default', { mode: 'string' }).default('hello'),
			stringColumnDefaultSql: blob('string_column_default_sql', { mode: 'string' }).default(sql`('hello')`),
		}),
		allMediumBlobs: mysqlTable('all_medium_blobs', {
			simple: mediumblob('simple'),
			columnNotNull: mediumblob('column_not_null').notNull(),
			columnDefault: mediumblob('column_default').default(Buffer.from('hello')),
			columnDefaultSql: mediumblob('column_default_sql').default(sql`'hello'`),
			stringSimple: mediumblob('string_simple', { mode: 'string' }),
			stringColumnNotNull: mediumblob('string_column_not_null', { mode: 'string' }).notNull(),
			stringColumnDefault: mediumblob('string_column_default', { mode: 'string' }).default('hello'),
			stringColumnDefaultSql: mediumblob('string_column_default_sql', { mode: 'string' }).default(sql`'hello'`),
		}),
		allLongBlobs: mysqlTable('all_long_blobs', {
			simple: longblob('simple'),
			columnNotNull: longblob('column_not_null').notNull(),
			columnDefault: longblob('column_default').default(Buffer.from('hello')),
			columnDefaultSql: longblob('column_default_sql').default(sql`'hello'`),
			stringSimple: longblob('string_simple', { mode: 'string' }),
			stringColumnNotNull: longblob('string_column_not_null', { mode: 'string' }).notNull(),
			stringColumnDefault: longblob('string_column_default', { mode: 'string' }).default('hello'),
			stringColumnDefaultSql: longblob('string_column_default_sql', { mode: 'string' }).default(sql`'hello'`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema1, []);

	await push({ db, to: schema1 });
	const { sqlStatements: sbsqSt } = await push({ db, to: schema1 });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(sbsqSt).toStrictEqual(st0);
});

test('drop primary key', async () => {
	const from = {
		table: mysqlTable('table', {
			id: int().primaryKey(),
		}),
	};
	const to = {
		table: mysqlTable('table', {
			id: int(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` DROP PRIMARY KEY;',
		/*
			when we drop pk from the column - we expect implicit not null constraint
			to be dropped, though it's not. Thus we need to not only drop pk,
			but a not null constraint too.
		*/
		'ALTER TABLE `table` MODIFY COLUMN `id` int;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test(`create table with char set and collate`, async () => {
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).charSet('big5').collate('big5_bin'),
			name2: char('name2').charSet('big5').collate('big5_bin'),
			name3: text('name3').charSet('big5').collate('big5_bin'),
			name4: tinytext('name4').charSet('big5').collate('big5_bin'),
			name5: mediumtext('name5').charSet('big5').collate('big5_bin'),
			name6: longtext('name6').charSet('big5').collate('big5_bin'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5').collate('big5_bin'),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE TABLE \`table\` (
	\`id\` int,
	\`name1\` varchar(1) CHARACTER SET big5 COLLATE big5_bin,
	\`name2\` char CHARACTER SET big5 COLLATE big5_bin,
	\`name3\` text CHARACTER SET big5 COLLATE big5_bin,
	\`name4\` tinytext CHARACTER SET big5 COLLATE big5_bin,
	\`name5\` mediumtext CHARACTER SET big5 COLLATE big5_bin,
	\`name6\` longtext CHARACTER SET big5 COLLATE big5_bin,
	\`test_enum\` enum('1','2') CHARACTER SET big5 COLLATE big5_bin
);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test(`create table with char set and collate with default and not null`, async () => {
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 15 }).charSet('big5').collate('big5_bin').notNull().default('hey'),
			name2: char('name2', { length: 10 }).charSet('big5').collate('big5_bin').notNull().default('hey'),
			name3: text('name3').charSet('big5').collate('big5_bin').notNull().default('hey'),
			name4: tinytext('name4').charSet('big5').collate('big5_bin').notNull().default('hey'),
			name5: mediumtext('name5').charSet('big5').collate('big5_bin').notNull().default('hey'),
			name6: longtext('name6').charSet('big5').collate('big5_bin').notNull().default('hey'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5').collate('big5_bin').notNull().default('1'),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE TABLE \`table\` (
	\`id\` int,
	\`name1\` varchar(15) CHARACTER SET big5 COLLATE big5_bin NOT NULL DEFAULT 'hey',
	\`name2\` char(10) CHARACTER SET big5 COLLATE big5_bin NOT NULL DEFAULT 'hey',
	\`name3\` text CHARACTER SET big5 COLLATE big5_bin NOT NULL DEFAULT ('hey'),
	\`name4\` tinytext CHARACTER SET big5 COLLATE big5_bin NOT NULL DEFAULT ('hey'),
	\`name5\` mediumtext CHARACTER SET big5 COLLATE big5_bin NOT NULL DEFAULT ('hey'),
	\`name6\` longtext CHARACTER SET big5 COLLATE big5_bin NOT NULL DEFAULT ('hey'),
	\`test_enum\` enum('1','2') CHARACTER SET big5 COLLATE big5_bin NOT NULL DEFAULT '1'
);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test(`add column with char set and collate`, async () => {
	const from = {
		table: mysqlTable('table', {
			id: int(),
		}),
	};
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).charSet('big5').collate('big5_bin'),
			name2: char('name2').charSet('big5').collate('big5_bin'),
			name3: text('name3').charSet('big5').collate('big5_bin'),
			name4: tinytext('name4').charSet('big5').collate('big5_bin'),
			name5: mediumtext('name5').charSet('big5').collate('big5_bin'),
			name6: longtext('name6').charSet('big5').collate('big5_bin'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5').collate('big5_bin'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` ADD `name1` varchar(1) CHARACTER SET big5 COLLATE big5_bin;',
		'ALTER TABLE `table` ADD `name2` char CHARACTER SET big5 COLLATE big5_bin;',
		'ALTER TABLE `table` ADD `name3` text CHARACTER SET big5 COLLATE big5_bin;',
		'ALTER TABLE `table` ADD `name4` tinytext CHARACTER SET big5 COLLATE big5_bin;',
		'ALTER TABLE `table` ADD `name5` mediumtext CHARACTER SET big5 COLLATE big5_bin;',
		'ALTER TABLE `table` ADD `name6` longtext CHARACTER SET big5 COLLATE big5_bin;',
		"ALTER TABLE `table` ADD `test_enum` enum('1','2') CHARACTER SET big5 COLLATE big5_bin;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test(`update char set and collate`, async () => {
	const from = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).charSet('big5').collate('big5_bin'),
			name2: char('name2').charSet('big5').collate('big5_bin'),
			name3: text('name3').charSet('big5').collate('big5_bin'),
			name4: tinytext('name4').charSet('big5').collate('big5_bin'),
			name5: mediumtext('name5').charSet('big5').collate('big5_bin'),
			name6: longtext('name6').charSet('big5').collate('big5_bin'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5').collate('big5_bin'),
		}),
	};
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).charSet('cp1250').collate('cp1250_bin'),
			name2: char('name2').charSet('cp1250').collate('cp1250_bin'),
			name3: text('name3').charSet('cp1250').collate('cp1250_bin'),
			name4: tinytext('name4').charSet('cp1250').collate('cp1250_bin'),
			name5: mediumtext('name5').charSet('cp1250').collate('cp1250_bin'),
			name6: longtext('name6').charSet('cp1250').collate('cp1250_bin'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('cp1250').collate('cp1250_bin'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` MODIFY COLUMN `name1` varchar(1) CHARACTER SET cp1250 COLLATE cp1250_bin;',
		'ALTER TABLE `table` MODIFY COLUMN `name2` char CHARACTER SET cp1250 COLLATE cp1250_bin;',
		'ALTER TABLE `table` MODIFY COLUMN `name3` text CHARACTER SET cp1250 COLLATE cp1250_bin;',
		'ALTER TABLE `table` MODIFY COLUMN `name4` tinytext CHARACTER SET cp1250 COLLATE cp1250_bin;',
		'ALTER TABLE `table` MODIFY COLUMN `name5` mediumtext CHARACTER SET cp1250 COLLATE cp1250_bin;',
		'ALTER TABLE `table` MODIFY COLUMN `name6` longtext CHARACTER SET cp1250 COLLATE cp1250_bin;',
		"ALTER TABLE `table` MODIFY COLUMN `test_enum` enum('1','2') CHARACTER SET cp1250 COLLATE cp1250_bin;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test(`update collate`, async () => {
	const from = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).charSet('big5').collate('big5_bin'),
			name2: char('name2').charSet('big5').collate('big5_bin'),
			name3: text('name3').charSet('big5').collate('big5_bin'),
			name4: tinytext('name4').charSet('big5').collate('big5_bin'),
			name5: mediumtext('name5').charSet('big5').collate('big5_bin'),
			name6: longtext('name6').charSet('big5').collate('big5_bin'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5').collate('big5_bin'),
		}),
	};
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).charSet('big5').collate('big5_chinese_ci'),
			name2: char('name2').charSet('big5').collate('big5_chinese_ci'),
			name3: text('name3').charSet('big5').collate('big5_chinese_ci'),
			name4: tinytext('name4').charSet('big5').collate('big5_chinese_ci'),
			name5: mediumtext('name5').charSet('big5').collate('big5_chinese_ci'),
			name6: longtext('name6').charSet('big5').collate('big5_chinese_ci'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5').collate('big5_chinese_ci'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` MODIFY COLUMN `name1` varchar(1) CHARACTER SET big5 COLLATE big5_chinese_ci;',
		'ALTER TABLE `table` MODIFY COLUMN `name2` char CHARACTER SET big5 COLLATE big5_chinese_ci;',
		'ALTER TABLE `table` MODIFY COLUMN `name3` text CHARACTER SET big5 COLLATE big5_chinese_ci;',
		'ALTER TABLE `table` MODIFY COLUMN `name4` tinytext CHARACTER SET big5 COLLATE big5_chinese_ci;',
		'ALTER TABLE `table` MODIFY COLUMN `name5` mediumtext CHARACTER SET big5 COLLATE big5_chinese_ci;',
		'ALTER TABLE `table` MODIFY COLUMN `name6` longtext CHARACTER SET big5 COLLATE big5_chinese_ci;',
		"ALTER TABLE `table` MODIFY COLUMN `test_enum` enum('1','2') CHARACTER SET big5 COLLATE big5_chinese_ci;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test(`push-push: only char set is specified (default collation used for char set)`, async () => {
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).charSet('big5'),
			name2: char('name2').charSet('big5'),
			name3: text('name3').charSet('big5'),
			name4: tinytext('name4').charSet('big5'),
			name5: mediumtext('name5').charSet('big5'),
			name6: longtext('name6').charSet('big5'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5'),
		}),
	};

	await push({ db, to });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(pst).toStrictEqual(st0);
});

test(`push-push: only collation is specified (char set that is linked to this collation used)`, async () => {
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).collate('utf8mb3_slovak_ci'),
			name2: char('name2').collate('ascii_bin'),
			name3: text('name3').collate('cp1250_general_ci'),
			name4: tinytext('name4').collate('cp1256_bin'),
			name5: mediumtext('name5').collate('koi8u_bin'),
			name6: longtext('name6').collate('utf16_danish_ci'),
			name7: mysqlEnum('test_enum', ['1', '2']).collate('utf16_danish_ci'),
		}),
	};

	await push({ db, to });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(pst).toStrictEqual(st0);
});

test(`push-push: no collation + no char set (db stores as collation: 'utf8mb4_0900_ai_ci', charSet: 'utf8mb4')`, async () => {
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }),
			name2: char('name2'),
			name3: text('name3'),
			name4: tinytext('name4'),
			name5: mediumtext('name5'),
			name6: longtext('name6'),
			name7: mysqlEnum('test_enum', ['1', '2']),
		}),
	};

	await push({ db, to });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(pst).toStrictEqual(st0);
});

test(`push-push: collation char set`, async () => {
	const to = {
		table: mysqlTable('table', {
			id: int(),
			name1: varchar('name1', { length: 1 }).charSet('big5').collate('big5_chinese_ci'),
			name2: char('name2').charSet('big5').collate('big5_chinese_ci'),
			name3: text('name3').charSet('big5').collate('big5_chinese_ci'),
			name4: tinytext('name4').charSet('big5').collate('big5_chinese_ci'),
			name5: mediumtext('name5').charSet('big5').collate('big5_chinese_ci'),
			name6: longtext('name6').charSet('big5').collate('big5_chinese_ci'),
			name7: mysqlEnum('test_enum', ['1', '2']).charSet('big5').collate('big5_chinese_ci'),
		}),
	};

	await push({ db, to });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(pst).toStrictEqual(st0);
});

test(`push-push: check on update now with fsp #1`, async () => {
	const to = {
		table: mysqlTable('table', {
			id: int(),
			created_at: timestamp().onUpdateNow(),
		}),
	};

	await push({ db, to });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(pst).toStrictEqual(st0);
});

test(`push-push: check on update now with fsp #2`, async () => {
	const to = {
		table: mysqlTable('table', {
			id: int(),
			created_at: timestamp({ fsp: 3 }).onUpdateNow({ fsp: 3 }),
		}),
	};

	await push({ db, to });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(pst).toStrictEqual(st0);
});

test('weird serial non-pk', async () => {
	// old kit was generating serials with autoincrements which is wrong
	db.query('create table `table`(c1 int not null, c2 serial auto_increment, CONSTRAINT `PRIMARY` PRIMARY KEY(`c1`));');

	const table = mysqlTable('table', {
		c1: int().primaryKey(),
		c2: serial(),
	});

	const res1 = await push({ db, to: { table } });
	const res2 = await push({ db, to: { table } });

	expect(res1.sqlStatements).toStrictEqual([]);
	expect(res2.sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2216
test('rename column with pk on another column', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
			column2: int(),
		}),
		table2: mysqlTable('table2', {
			column1: int(),
			column2: int(),
			column3: int(),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2] }),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int PRIMARY KEY,\n\t`column2` int\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int,\n\t`column2` int,\n\t`column3` int,\n\tCONSTRAINT `PRIMARY` PRIMARY KEY(`column1`,`column2`)\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
			column2_renamed: int('column2_renamed').notNull(),
		}),
		table2: mysqlTable('table2', {
			column1: int(),
			column2: int(),
			column3_renamed: int('column3_renamed').notNull(),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2] }),
		]),
	};

	const renames = [
		'table1.column2->table1.column2_renamed',
		'table2.column3->table2.column3_renamed',
	];
	const { sqlStatements: st2 } = await diff(n1, schema2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: schema2, renames });
	const expectedSt2 = [
		'ALTER TABLE `table1` RENAME COLUMN `column2` TO `column2_renamed`;',
		'ALTER TABLE `table2` RENAME COLUMN `column3` TO `column3_renamed`;',
		'ALTER TABLE `table1` MODIFY COLUMN `column2_renamed` int NOT NULL;',
		'ALTER TABLE `table2` MODIFY COLUMN `column3_renamed` int NOT NULL;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/706
test('add pk', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int(),
		}),
		table2: mysqlTable('table2', {
			column1: int().unique(),
		}),
		table3: mysqlTable('table3', {
			column1: int().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int,\n\tCONSTRAINT `column1_unique` UNIQUE INDEX(`column1`)\n);\n',
		'CREATE TABLE `table3` (\n\t`column1` int,\n\tCONSTRAINT `column1_unique` UNIQUE INDEX(`column1`)\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
		}),
		table2: mysqlTable('table2', {
			column1: int().unique().primaryKey(),
		}),
		table3: mysqlTable('table3', {
			column1: int().primaryKey(),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'DROP INDEX `column1_unique` ON `table3`;',
		'ALTER TABLE `table1` ADD PRIMARY KEY (`column1`);',
		'ALTER TABLE `table2` ADD PRIMARY KEY (`column1`);',
		'ALTER TABLE `table3` ADD PRIMARY KEY (`column1`);',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2795
test('add not null to column with default', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
			column2: boolean().default(true),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int PRIMARY KEY,\n\t`column2` boolean DEFAULT true\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
			column2: boolean().default(true),
			column3: boolean().default(false),
		}),
	};

	const { sqlStatements: st2, next: n2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'ALTER TABLE `table1` ADD `column3` boolean DEFAULT false;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);

	const schema3 = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
			column2: boolean().default(true).notNull(),
			column3: boolean().default(false).notNull(),
		}),
	};

	const { sqlStatements: st3 } = await diff(n2, schema3, []);
	const { sqlStatements: pst3 } = await push({ db, to: schema3 });
	const expectedSt3 = [
		'ALTER TABLE `table1` MODIFY COLUMN `column2` boolean DEFAULT true NOT NULL;',
		'ALTER TABLE `table1` MODIFY COLUMN `column3` boolean DEFAULT false NOT NULL;',
	];
	expect(st3).toStrictEqual(expectedSt3);
	expect(pst3).toStrictEqual(expectedSt3);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5125
test('case - #5125', async () => {
	const students = mysqlTable('student', {
		id: int().primaryKey().autoincrement(),
	});

	const courses = mysqlTable('course', {
		id: int().primaryKey().autoincrement(),
	});

	const studentCourse = mysqlTable('student_course', {
		studentId: int().notNull().references(() => students.id), // FK relies on PK index by default in MySQL
		courseId: int().notNull().references(() => courses.id),
	}, (table) => [
		primaryKey({ columns: [table.studentId, table.courseId] }),
	]);

	const to = {
		students,
		courses,
		studentCourse,
	};

	await push({ db, to });
});

test('push after migrate with custom migrations table #1', async () => {
	const migrationsConfig = {
		table: undefined,
	};

	const { migrate } = await import('drizzle-orm/mysql2/migrator');
	const { drizzle } = await import('drizzle-orm/mysql2');

	await migrate(drizzle({ client }), {
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/mysql/migrations',
	});

	const to = {
		table: mysqlTable('table1', { col1: int() }),
	};

	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await push({ db, to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE `table1` (\n\t`col1` int\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('push after migrate with custom migrations table #2', async () => {
	const migrationsConfig = {
		table: 'migrations',
	};

	const { migrate } = await import('drizzle-orm/mysql2/migrator');
	const { drizzle } = await import('drizzle-orm/mysql2');

	await migrate(drizzle({ client }), {
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/mysql/migrations',
	});

	const to = {
		table: mysqlTable('table1', { col1: int() }),
	};
	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await push({ db, to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE `table1` (\n\t`col1` int\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('create table with datetime .onUpdateNow() diff variations', async () => {
	const to = {
		users: mysqlTable('users', {
			col1: datetime().onUpdateNow(),
			col2: datetime({ fsp: 1 }).onUpdateNow({ fsp: 1 }),
			col3: datetime({ fsp: 3 }).onUpdateNow({ fsp: 3 }),
			col4: datetime({ fsp: 6 }).onUpdateNow({ fsp: 6 }),
			col5: datetime({ mode: 'string' }).onUpdateNow(),
			col6: datetime({ mode: 'date' }).onUpdateNow(),
		}),
	};

	const res = await push({ db, to });

	expect(res.sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (' + '\n'
		+ '\t`col1` datetime ON UPDATE CURRENT_TIMESTAMP,' + '\n'
		+ '\t`col2` datetime(1) ON UPDATE CURRENT_TIMESTAMP(1),' + '\n'
		+ '\t`col3` datetime(3) ON UPDATE CURRENT_TIMESTAMP(3),' + '\n'
		+ '\t`col4` datetime(6) ON UPDATE CURRENT_TIMESTAMP(6),' + '\n'
		+ '\t`col5` datetime,' + '\n'
		+ '\t`col6` datetime ON UPDATE CURRENT_TIMESTAMP' + '\n'
		+ ');\n',
	]);
});

test('create table with datetime .onUpdateNow() diff variations', async () => {
	const orders = mysqlTable('orders', {
		id: int({ unsigned: true }).notNull().primaryKey().autoincrement(),
		catalog_id: int({ unsigned: true }).notNull().default(0),
		created_at: timestamp('created_at', { mode: 'date', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
	}, (table) => [
		index('orders_created_at').on(table.created_at),
		index('orders_catalog_id').on(table.catalog_id),
	]);

	const orderItems = mysqlTable('orderitems', {
		id: int({ unsigned: true }).notNull().primaryKey().autoincrement(),
		catalog_id: int({ unsigned: true }).notNull().default(0),
		order_id: int({ unsigned: true }).notNull(),
		sku: varchar({ length: 255 }).default('').notNull(),
	}, (table) => [
		index('orderitems_order_id').on(table.order_id),
		index('orderitems_catalog_id').on(table.catalog_id),
		index('orderitems_sku').on(table.sku),
		primaryKey({ columns: [table.id] }),
	]);

	const to = {
		orders,
		orderItems,
	};

	await expect(push({ db, to })).resolves.not.toThrowError();
});
