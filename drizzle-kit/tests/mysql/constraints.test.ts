import { desc, sql } from 'drizzle-orm';
import {
	AnyMySqlColumn,
	bigint,
	binary,
	blob,
	char,
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

// TODO: add simple .unique(), etc. To discuss with @OleksiiKH0240
test('#1', async () => {
	const users3 = mysqlTable('users3', {
		c1: varchar({ length: 100 }),
	}, (t) => [
		unique().on(t.c1),
	]);

	const users4 = mysqlTable('users4', {
		c1: varchar({ length: 100 }).unique().references(() => users3.c1),
		c2: varchar({ length: 100 }).references((): AnyMySqlColumn => users4.c1),
	});
	const to = {
		users3,
		users4,
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users3` (\n\t`c1` varchar(100),\n\tCONSTRAINT `c1_unique` UNIQUE INDEX(`c1`)\n);\n',
		'CREATE TABLE `users4` (\n\t`c1` varchar(100),\n\t`c2` varchar(100),\n\tCONSTRAINT `c1_unique` UNIQUE INDEX(`c1`)\n);\n',
		'ALTER TABLE `users4` ADD CONSTRAINT `users4_c1_users3_c1_fkey` FOREIGN KEY (`c1`) REFERENCES `users3`(`c1`);',
		'ALTER TABLE `users4` ADD CONSTRAINT `users4_c2_users4_c1_fkey` FOREIGN KEY (`c2`) REFERENCES `users4`(`c1`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// TODO: implement geometry types
test('unique constraint errors #1', async () => {
	const to = {
		table: mysqlTable('table', {
			column1: text().unique(),
			column2: tinytext().unique(),
			column3: mediumtext().unique(),
			column4: longtext().unique(),
			column5: blob().unique(),
			column6: tinyblob().unique(),
			column7: mediumblob().unique(),
			column8: longblob().unique(),
			column9: json().unique(),
			column10: varchar({ length: 769 }).unique(), // 768 max depends on mysql version and engine (4 bytes per character for last version)
			// column11: geometry().unique(),
		}),
	};

	const { sqlStatements: st, ddl1Err, ddl2Err, mappedErrors1, mappedErrors2 } = await diff({}, to, []);

	expect(ddl1Err).toStrictEqual([]);
	expect(ddl2Err).toStrictEqual([
		{
			columns: ['column1'],
			table: 'table',
			type: 'column_unsupported_unique',
		},
		{
			columns: ['column2'],
			table: 'table',
			type: 'column_unsupported_unique',
		},
		{
			columns: ['column3'],
			table: 'table',
			type: 'column_unsupported_unique',
		},
		{
			columns: ['column4'],
			table: 'table',
			type: 'column_unsupported_unique',
		},
		{
			columns: ['column5'],
			table: 'table',
			type: 'column_unsupported_unique',
		},
		{
			columns: ['column6'],
			table: 'table',
			type: 'column_unsupported_unique',
		},
		{
			columns: ['column7'],
			table: 'table',
			type: 'column_unsupported_unique',
		},
		{
			columns: ['column8'],
			table: 'table',
			type: 'column_unsupported_unique',
		},
	]);
	await expect(push({ db, to })).rejects.toThrowError();
});

test('unique constraint errors #2', async () => {
	const to = {
		table: mysqlTable('table', {
			column1: text(),
			column2: tinytext(),
			column3: mediumtext(),
			column4: longtext(),
			column5: blob(),
			column6: tinyblob(),
			column7: mediumblob(),
			column8: longblob(),
			column9: json(),
			column10: varchar({ length: 769 }), // 768 max depends on mysql version and engine (4 bytes per character for last version)
			// column11: geometry(),
		}, (table) => [
			unique().on(table.column1),
			unique().on(table.column2),
			unique().on(table.column3),
			unique().on(table.column4),
			unique().on(table.column5),
			unique().on(table.column6),
			unique().on(table.column7),
			unique().on(table.column8),
			unique().on(table.column9),
			unique().on(table.column10),
			// unique().on(table.column11),
		]),
	};

	const { sqlStatements: st, ddl1Err, ddl2Err, mappedErrors1, mappedErrors2 } = await diff({}, to, []);

	expect(ddl1Err).toStrictEqual([]);
	expect(ddl2Err).toStrictEqual(
		[
			{
				columns: ['column1'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
			{
				columns: ['column2'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
			{
				columns: ['column3'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
			{
				columns: ['column4'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
			{
				columns: ['column5'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
			{
				columns: ['column6'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
			{
				columns: ['column7'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
			{
				columns: ['column8'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
		],
	);
	expect(mappedErrors1).toStrictEqual([]);
	await expect(push({ db, to })).rejects.toThrowError();
});

test('unique constraint errors #3', async () => {
	const to = {
		table: mysqlTable('table', {
			column1: text(),
			column2: tinytext(),
			column3: mediumtext(),
			column4: longtext(),
			column5: blob(),
			column6: tinyblob(),
			column7: mediumblob(),
			column8: longblob(),
			column9: json(),
			column10: varchar({ length: 769 }), // 768 max depends on mysql version and engine (4 bytes per character for last version)
			// column11: geometry(),
		}, (table) => [
			unique().on(
				table.column1,
				table.column2,
				table.column3,
				table.column4,
				table.column5,
				table.column6,
				table.column7,
				table.column8,
				table.column9,
				table.column10,
			),
		]),
	};

	const { sqlStatements: st, ddl1Err, ddl2Err, mappedErrors1, mappedErrors2 } = await diff({}, to, []);
	expect(ddl1Err).toStrictEqual([]);
	expect(ddl2Err).toStrictEqual(
		[
			{
				columns: ['column1', 'column2', 'column3', 'column4', 'column5', 'column6', 'column7', 'column8'],
				table: 'table',
				type: 'column_unsupported_unique',
			},
		],
	);
	await expect(push({ db, to })).rejects.toThrowError();
});

test('unique, fk constraints order #1', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int(),
			column2: varchar({ length: 256 }),
		}),
		table2: mysqlTable('table2', {
			column1: int(),
			column2: varchar({ length: 256 }),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int,\n\t`column2` varchar(256)\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int,\n\t`column2` varchar(256)\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const table1 = mysqlTable('table1', {
		column1: int(),
		column2: varchar({ length: 256 }).unique(),
	});
	const table2 = mysqlTable('table2', {
		column1: int(),
		column2: varchar({ length: 256 }).references(() => table1.column2),
	});
	const schema2 = { table1, table2 };

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'CREATE UNIQUE INDEX `column2_unique` ON `table1` (`column2`);',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_column2_table1_column2_fkey` FOREIGN KEY (`column2`) REFERENCES `table1`(`column2`);',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('unique, fk constraints order #2', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int(),
			column2: varchar({ length: 256 }),
		}),
		table2: mysqlTable('table2', {
			column1: int(),
			column2: varchar({ length: 256 }),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int,\n\t`column2` varchar(256)\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int,\n\t`column2` varchar(256)\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const table1 = mysqlTable('table1', {
		column1: int(),
		column2: varchar({ length: 256 }),
	}, (table) => [
		unique().on(table.column1, table.column2),
	]);
	const table2 = mysqlTable('table2', {
		column1: int(),
		column2: varchar({ length: 256 }),
	}, (table) => [
		foreignKey({
			columns: [table.column1, table.column2],
			foreignColumns: [table1.column1, table1.column2],
			name: 'custom_fk', // TODO: revise: should there be any migrations if user change schema to omit name of constraint?
		}),
	]);
	const schema2 = { table1, table2 };

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'CREATE UNIQUE INDEX `column1_column2_unique` ON `table1` (`column1`,`column2`);',
		'ALTER TABLE `table2` ADD CONSTRAINT `custom_fk` FOREIGN KEY (`column1`,`column2`) REFERENCES `table1`(`column1`,`column2`);',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2236
// https://github.com/drizzle-team/drizzle-orm/issues/3329
test('add column before creating unique constraint', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int(),
		}),
		table2: mysqlTable('table2', {
			column1: int(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		table1: mysqlTable('table1', {
			column1: int(),
			column2: varchar({ length: 256 }),
		}, (table) => [
			unique().on(table.column1, table.column2),
		]),
		table2: mysqlTable('table2', {
			column1: int(),
			column2: varchar({ length: 256 }).unique(),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'ALTER TABLE `table1` ADD `column2` varchar(256);',
		'ALTER TABLE `table2` ADD `column2` varchar(256);',
		'CREATE UNIQUE INDEX `column2_unique` ON `table2` (`column2`);',
		'CREATE UNIQUE INDEX `column1_column2_unique` ON `table1` (`column1`,`column2`);',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('primary key, fk constraint order #1', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int(),
		}),
		table2: mysqlTable('table2', {
			column1: int(),
			column2: int(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int,\n\t`column2` int\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const table1 = mysqlTable('table1', {
		column1: int().primaryKey(),
	});
	const table2 = mysqlTable('table2', {
		column1: int(),
		column2: int().references(() => table1.column1),
	});
	const schema2 = { table1, table2 };

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2 = [
		'ALTER TABLE `table1` ADD PRIMARY KEY (`column1`);',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_column2_table1_column1_fkey` FOREIGN KEY (`column2`) REFERENCES `table1`(`column1`);',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('primary key, fk constraint order #2', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int(),
			column2: varchar({ length: 256 }),
		}),
		table2: mysqlTable('table2', {
			column1: int(),
			column2: int(),
			column3: varchar({ length: 256 }),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` int,\n\t`column2` varchar(256)\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int,\n\t`column2` int,\n\t`column3` varchar(256)\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const table1 = mysqlTable('table1', {
		column1: int(),
		column2: varchar({ length: 256 }),
	}, (table) => [
		primaryKey({ columns: [table.column1, table.column2] }),
	]);
	const table2 = mysqlTable('table2', {
		column1: int(),
		column2: int(),
		column3: varchar({ length: 256 }),
	}, (table) => [
		foreignKey({
			columns: [table.column2, table.column3],
			foreignColumns: [table1.column1, table1.column2],
			name: 'custom_fk',
		}),
	]);
	const schema2 = { table1, table2 };

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2 = [
		'ALTER TABLE `table1` ADD PRIMARY KEY (`column1`,`column2`);',
		'ALTER TABLE `table2` ADD CONSTRAINT `custom_fk` FOREIGN KEY (`column2`,`column3`) REFERENCES `table1`(`column1`,`column2`);',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4704
test('index with sort', async () => {
	const to = {
		table: mysqlTable('table', {
			column1: int(),
			column2: int(),
			column3: int(),
		}, (table) => ({
			tableCompositeIdx: index('table_composite_idx').on(
				table.column1,
				table.column2,
				desc(table.column3), // Attempting to sort by column3 DESC
			),
		})),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });
	const expectedSt = [
		'CREATE TABLE `table` (\n\t`column1` int,\n\t`column2` int,\n\t`column3` int\n);\n',
		'CREATE INDEX `table_composite_idx` ON `table` (`column1`,`column2`,`column3` desc);',
	];

	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4221
test('fk on char column', async () => {
	function column1() {
		return char('column1', { length: 24 }).primaryKey().$defaultFn(() => '1');
	}
	const table1 = mysqlTable(
		'table1',
		{
			column1: column1(),
		},
	);
	const table2 = mysqlTable(
		'table2',
		{
			column1: column1(),
			column2: char('column2', { length: 24 }).references(() => table1.column1).notNull(),
		},
	);
	const to = { table1, table2 };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });
	const expectedSt: string[] = [
		'CREATE TABLE `table1` (\n\t`column1` char(24) PRIMARY KEY\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` char(24) PRIMARY KEY,\n\t`column2` char(24) NOT NULL\n);\n',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_column2_table1_column1_fkey` FOREIGN KEY (`column2`) REFERENCES `table1`(`column1`);',
	];

	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);
});

// https://github.com/drizzle-team/drizzle-orm/issues/486
// https://github.com/drizzle-team/drizzle-orm/issues/3244
test('fk name is too long', async () => {
	const table1 = mysqlTable(
		'table1_loooooong',
		{
			column1: int('column1_looooong').primaryKey(),
		},
	);
	const table2 = mysqlTable(
		'table2_loooooong',
		{
			column1: int('column1_looooong').references(() => table1.column1).notNull(),
		},
	);
	const to = { table1, table2 };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });
	const expectedSt: string[] = [
		'CREATE TABLE `table1_loooooong` (\n\t`column1_looooong` int PRIMARY KEY\n);\n',
		'CREATE TABLE `table2_loooooong` (\n\t`column1_looooong` int NOT NULL\n);\n',
		'ALTER TABLE `table2_loooooong` ADD CONSTRAINT `table2_loooooong_KObGFnvgHDVg_fkey` FOREIGN KEY (`column1_looooong`) REFERENCES `table1_loooooong`(`column1_looooong`);',
	];

	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);
});

// https://github.com/drizzle-team/drizzle-orm/issues/265
// https://github.com/drizzle-team/drizzle-orm/issues/3293
// https://github.com/drizzle-team/drizzle-orm/issues/2018
test('adding on delete to 2 fks', async () => {
	const table1 = mysqlTable('table1', {
		column1: int().primaryKey(),
	});
	const table2 = mysqlTable('table2', {
		column1: int().primaryKey(),
		column2: int().references(() => table1.column1).notNull(),
		column3: int().references(() => table1.column1).notNull(),
	});
	const schema1 = { table1, table2 };

	const { next: n1, sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1: string[] = [
		'CREATE TABLE `table1` (\n\t`column1` int PRIMARY KEY\n);\n',
		'CREATE TABLE `table2` (\n\t`column1` int PRIMARY KEY,\n\t`column2` int NOT NULL,\n\t`column3` int NOT NULL\n);\n',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_column2_table1_column1_fkey` FOREIGN KEY (`column2`) REFERENCES `table1`(`column1`);',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_column3_table1_column1_fkey` FOREIGN KEY (`column3`) REFERENCES `table1`(`column1`);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const table3 = mysqlTable('table1', {
		column1: int().primaryKey(),
	});
	const table4 = mysqlTable('table2', {
		column1: int().primaryKey(),
		column2: int().references(() => table1.column1, { onDelete: 'cascade' }).notNull(),
		column3: int().references(() => table1.column1, { onDelete: 'cascade' }).notNull(),
	});
	const schema2 = { table3, table4 };

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE `table2` DROP CONSTRAINT `table2_column2_table1_column1_fkey`;',
		'ALTER TABLE `table2` DROP CONSTRAINT `table2_column3_table1_column1_fkey`;',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_column2_table1_column1_fkey` FOREIGN KEY (`column2`) REFERENCES `table1`(`column1`) ON DELETE CASCADE;',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_column3_table1_column1_fkey` FOREIGN KEY (`column3`) REFERENCES `table1`(`column1`) ON DELETE CASCADE;',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('adding autoincrement to table with pk #1', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int().primaryKey(),
		}),
	};

	const { next: n1, sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1: string[] = [
		'CREATE TABLE `table1` (\n\t`column1` int PRIMARY KEY\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		table1: mysqlTable('table1', {
			column1: int().autoincrement().primaryKey(),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE `table1` MODIFY COLUMN `column1` int AUTO_INCREMENT NOT NULL;',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('adding autoincrement to table with pk #2', async () => {
	// TODO: revise: I can successfully run all the queries manually, but somehow it throws error in the test
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int().notNull(),
			column2: int(),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2] }),
		]),
	};

	const { next: n1, sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1: string[] = [
		'CREATE TABLE `table1` (\n\t`column1` int NOT NULL,\n\t`column2` int,\n\tCONSTRAINT `PRIMARY` PRIMARY KEY(`column1`,`column2`)\n);\n',
	];

	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		table1: mysqlTable('table1', {
			column1: int().notNull().autoincrement(),
			column2: int().default(1),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2] }),
		]),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE `table1` MODIFY COLUMN `column1` int AUTO_INCREMENT NOT NULL;',
		'ALTER TABLE `table1` MODIFY COLUMN `column2` int DEFAULT 1;',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('adding autoincrement to table with unique #1', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int().unique(),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const schema2 = {
		table1: mysqlTable('table1', {
			column1: int().autoincrement().unique(),
		}),
	};

	const { sqlStatements: st } = await diff(n1, schema2, []);
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const expectedSt: string[] = [
		'ALTER TABLE `table1` MODIFY COLUMN `column1` int AUTO_INCREMENT;',
	];

	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);
});

test('adding autoincrement to table with unique #2', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: int(),
			column2: int(),
		}, (table) => [
			unique().on(table.column1, table.column2),
		]),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const schema2 = {
		table1: mysqlTable('table1', {
			column1: int().autoincrement(),
			column2: int(),
		}, (table) => [
			unique().on(table.column1, table.column2),
		]),
	};

	const { sqlStatements: st } = await diff(n1, schema2, []);
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const expectedSt: string[] = [
		'ALTER TABLE `table1` MODIFY COLUMN `column1` int AUTO_INCREMENT;',
	];

	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3471
test('drop column with pk and add pk to another column #1', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: varchar({ length: 256 }).primaryKey(),
			column2: varchar({ length: 256 }).notNull(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` varchar(256) PRIMARY KEY,\n\t`column2` varchar(256) NOT NULL\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		table1: mysqlTable('table1', {
			column2: varchar({ length: 256 }).primaryKey(),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE `table1` DROP PRIMARY KEY;',
		'ALTER TABLE `table1` ADD PRIMARY KEY (`column2`);',
		'ALTER TABLE `table1` DROP COLUMN `column1`;',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('drop column with pk and add pk to another column #2', async () => {
	const schema1 = {
		table1: mysqlTable('table1', {
			column1: varchar({ length: 256 }),
			column2: varchar({ length: 256 }),
			column3: varchar({ length: 256 }).notNull(),
			column4: varchar({ length: 256 }).notNull(),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2] }),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `table1` (\n\t`column1` varchar(256),\n\t`column2` varchar(256),'
		+ '\n\t`column3` varchar(256) NOT NULL,\n\t`column4` varchar(256) NOT NULL,'
		+ '\n\tCONSTRAINT `PRIMARY` PRIMARY KEY(`column1`,`column2`)\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		table1: mysqlTable('table1', {
			column3: varchar({ length: 256 }),
			column4: varchar({ length: 256 }),
		}, (table) => [
			primaryKey({ columns: [table.column3, table.column4] }),
		]),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE `table1` DROP PRIMARY KEY;',
		'ALTER TABLE `table1` ADD PRIMARY KEY (`column3`,`column4`);',
		'ALTER TABLE `table1` DROP COLUMN `column1`;',
		'ALTER TABLE `table1` DROP COLUMN `column2`;',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4456
test('drop column with pk and add pk to another column #3', async () => {
	const schema1 = {
		authors: mysqlTable(
			'authors',
			{
				publicationId: varchar('publication_id', { length: 64 }),
				authorID: varchar('author_id', { length: 10 }),
			},
			(table) => {
				return {
					pk: primaryKey(table.publicationId, table.authorID),
				};
			},
		),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `authors` (\n\t`publication_id` varchar(64),\n\t`author_id` varchar(10),'
		+ '\n\tCONSTRAINT `PRIMARY` PRIMARY KEY(`publication_id`,`author_id`)\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		authors: mysqlTable(
			'authors',
			{
				publicationId: varchar('publication_id', { length: 64 }),
				authorID: varchar('author_id', { length: 10 }),
				orcidId: varchar('orcid_id', { length: 64 }),
			},
			(table) => {
				return {
					pk: primaryKey(table.publicationId, table.authorID, table.orcidId),
				};
			},
		),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE `authors` DROP PRIMARY KEY;',
		'ALTER TABLE `authors` ADD `orcid_id` varchar(64);',
		'ALTER TABLE `authors` ADD PRIMARY KEY (`publication_id`,`author_id`,`orcid_id`);',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
