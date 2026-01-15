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

// https://github.com/drizzle-team/drizzle-orm/issues/3255
test('index #1', async () => {
	const table1 = mysqlTable('table1', {
		col1: int(),
		col2: int(),
	}, () => [
		index1,
		index2,
		index3,
		index4,
		index5,
		index6,
	]);

	const index1 = uniqueIndex('index1').on(table1.col1);
	const index2 = uniqueIndex('index2').on(table1.col1, table1.col2);
	const index3 = index('index3').on(table1.col1);
	const index4 = index('index4').on(table1.col1, table1.col2);
	const index5 = index('index5').on(sql`${table1.col1} asc`);
	const index6 = index('index6').on(sql`${table1.col1} asc`, sql`${table1.col2} desc`);

	const schema1 = { table1 };

	const { sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	const expectedSt1 = [
		'CREATE TABLE `table1` (\n'
		+ '\t`col1` int,\n'
		+ '\t`col2` int,\n'
		+ '\tCONSTRAINT `index1` UNIQUE INDEX(`col1`),\n'
		+ '\tCONSTRAINT `index2` UNIQUE INDEX(`col1`,`col2`)\n'
		+ ');\n',
		'CREATE INDEX `index3` ON `table1` (`col1`);',
		'CREATE INDEX `index4` ON `table1` (`col1`,`col2`);',
		'CREATE INDEX `index5` ON `table1` (`col1` asc);',
		'CREATE INDEX `index6` ON `table1` (`col1` asc,`col2` desc);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4962
test('functional index #1', async () => {
	const table1 = mysqlTable('table1', {
		id: varchar('id', { length: 21 }).primaryKey().notNull(),
		otherId: varchar('other_id', { length: 21 }),
		url: varchar('url', { length: 2048 }),
	}, (table) => [
		uniqueIndex('uniqueUrl').on(
			table.otherId,
			sql`${table.url}(747)`,
		),
	]);
	const schema1 = { table1 };

	const { sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	const expectedSt1 = [
		'CREATE TABLE `table1` (\n'
		+ '\t`id` varchar(21) PRIMARY KEY,\n'
		+ '\t`other_id` varchar(21),\n'
		+ '\t`url` varchar(2048),\n'
		+ '\tCONSTRAINT `uniqueUrl` UNIQUE INDEX(`other_id`,`url`(747))\n'
		+ ');\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
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

	const { sqlStatements: st, next: n } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });
	const expectedSt: string[] = [
		'CREATE TABLE `table1_loooooong` (\n\t`column1_looooong` int PRIMARY KEY\n);\n',
		'CREATE TABLE `table2_loooooong` (\n\t`column1_looooong` int NOT NULL\n);\n',
		'ALTER TABLE `table2_loooooong` ADD CONSTRAINT `table2_loooooong_KObGFnvgHDVg_fkey` FOREIGN KEY (`column1_looooong`) REFERENCES `table1_loooooong`(`column1_looooong`);',
	];

	expect(st).toStrictEqual(expectedSt);
	expect(pst).toStrictEqual(expectedSt);

	const { sqlStatements: st1 } = await diff(n, to, []);
	const { sqlStatements: pst1 } = await push({ db, to });

	const expectedSt1: string[] = [];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4456#issuecomment-3076042688
test('fk multistep #1', async () => {
	const foo = mysqlTable('foo', {
		id: int().primaryKey(),
	});

	const bar = mysqlTable('bar', {
		id: int().primaryKey(),
		fooId: int().references(() => foo.id),
	});

	const schema1 = { foo, bar };

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE `foo` (\n\t`id` int PRIMARY KEY\n);\n',
		'CREATE TABLE `bar` (\n\t`id` int PRIMARY KEY,\n\t`fooId` int\n);\n',
		'ALTER TABLE `bar` ADD CONSTRAINT `bar_fooId_foo_id_fkey` FOREIGN KEY (`fooId`) REFERENCES `foo`(`id`);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		bar: mysqlTable('bar', {
			id: int().primaryKey(),
			fooId: int(),
		}),
	};
	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'ALTER TABLE `bar` DROP CONSTRAINT `bar_fooId_foo_id_fkey`;',
		'DROP INDEX `bar_fooId_foo_id_fkey` ON `bar`',
		'DROP TABLE `foo`;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('cyclic fk with custom names', async () => {
	await db.query(`CREATE TABLE \`Users\` (
	\`id\` int primary key,
	\`inviteId\` int
);`);
	await db.query(`CREATE TABLE \`InviteCode\` (
	\`id\` int primary key,
	\`inviterUserId\` int
);`);
	await db.query(
		'ALTER TABLE `Users` ADD CONSTRAINT `usersToInviteCode` FOREIGN KEY (`inviteId`) REFERENCES `InviteCode` (`id`);',
	);
	await db.query(
		'ALTER TABLE `InviteCode` ADD CONSTRAINT `InviteCodeToUsers` FOREIGN KEY (`inviterUserId`) REFERENCES `Users` (`id`);',
	);

	const inviteCode = mysqlTable('InviteCode', {
		id: int().primaryKey(),
		inviterUserId: int().references((): AnyMySqlColumn => users.id),
	});

	const users = mysqlTable('Users', {
		id: int().primaryKey(),
		inviteId: int().references((): AnyMySqlColumn => inviteCode.id),
	});

	const schema1 = { inviteCode, users };

	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	expect(pst1).toStrictEqual([]);
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

// https://github.com/drizzle-team/drizzle-orm/issues/2458
test('composite pk #1', async () => {
	const schema = {
		account: mysqlTable('Account', {
			provider: varchar('provider', { length: 255 }).notNull(),
			providerAccountId: varchar('providerAccountId', { length: 255 }).notNull(),
		}, (table) => [
			primaryKey({ columns: [table.provider, table.providerAccountId] }),
		]),
	};

	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

test('pk multistep #1', async () => {
	const teamStats1 = mysqlTable('team_stats', {
		col1: int().unique().primaryKey(),
		col2: int(),
		col3: int(),
	});

	const schema1 = {
		teamStats1,
		table2: mysqlTable('table2', {
			teamStatsCol1: int().references(() => teamStats1.col1),
		}),
	};

	const { next: n1, sqlStatements: st1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const teamStats2 = mysqlTable('team_stats', {
		col1: int().unique(),
		col2: int(),
		col3: int(),
	}, (t) => [
		primaryKey({ columns: [t.col2, t.col3] }),
	]);

	const schema2 = {
		teamStats2,
		table2: mysqlTable('table2', {
			teamStatsCol1: int().references(() => teamStats2.col1),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSql2 = [
		'ALTER TABLE `table2` DROP CONSTRAINT `table2_teamStatsCol1_team_stats_col1_fkey`;',
		'ALTER TABLE `team_stats` DROP PRIMARY KEY;',
		'ALTER TABLE `team_stats` MODIFY COLUMN `col1` int;',
		'ALTER TABLE `team_stats` ADD PRIMARY KEY (`col2`,`col3`);',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_teamStatsCol1_team_stats_col1_fkey` FOREIGN KEY (`teamStatsCol1`) REFERENCES `team_stats`(`col1`);',
	];
	expect(st2).toStrictEqual(expectedSql2);
	expect(pst2).toStrictEqual(expectedSql2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/1144
test('pk multistep #2', async () => {
	const teamStats1 = mysqlTable('team_stats', {
		col1: int().primaryKey(),
		col2: int(),
		col3: int(),
	});

	const schema1 = {
		teamStats1,
		table2: mysqlTable('table2', {
			teamStatsCol1: int().references(() => teamStats1.col1),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const teamStats2 = mysqlTable('team_stats', {
		col1: int().unique(),
		col2: int(),
		col3: int(),
	}, (t) => [
		primaryKey({ columns: [t.col2, t.col3] }),
	]);

	const schema2 = {
		teamStats2,
		table2: mysqlTable('table2', {
			teamStatsCol1: int().references(() => teamStats2.col1),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSql2 = [
		'ALTER TABLE `table2` DROP CONSTRAINT `table2_teamStatsCol1_team_stats_col1_fkey`;',
		'ALTER TABLE `team_stats` DROP PRIMARY KEY;',
		'ALTER TABLE `team_stats` MODIFY COLUMN `col1` int;',
		'ALTER TABLE `team_stats` ADD PRIMARY KEY (`col2`,`col3`);',
		'CREATE UNIQUE INDEX `col1_unique` ON `team_stats` (`col1`);',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_teamStatsCol1_team_stats_col1_fkey` FOREIGN KEY (`teamStatsCol1`) REFERENCES `team_stats`(`col1`);',
	];
	expect(st2).toStrictEqual(expectedSql2);
	expect(pst2).toStrictEqual(expectedSql2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/1144
test('pk multistep #3', async () => {
	const teamStats1 = mysqlTable('team_stats', {
		col1: int().primaryKey(),
		col2: int(),
		col3: int(),
	});

	const schema1 = {
		teamStats1,
		table2: mysqlTable('table2', {
			teamStatsCol1: int().references(() => teamStats1.col1),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const teamStats2 = mysqlTable('team_stats', {
		col1: int(),
		col2: int(),
		col3: int(),
	}, (t) => [
		primaryKey({ columns: [t.col2, t.col3] }),
	]);

	const schema2 = {
		teamStats2,
		table2: mysqlTable('table2', {
			teamStatsCol1: int().references(() => teamStats2.col1),
		}),
	};

	const { sqlStatements: st2, suggestion } = await diff(n1, schema2, []);
	const { sqlStatements: pst2, hints } = await push({ db, to: schema2, ignoreSubsequent: true, expectError: true });

	expect(suggestion.errors).toStrictEqual([
		`· You are trying to drop primary key from "team_stats" ("col1"), but there is an existing reference on this column. You must either add a UNIQUE constraint to ("col1") or drop the foreign key constraint that references this column.`,
	]);
	expect(hints).toStrictEqual([{
		hint:
			'· You are trying to drop primary key from "team_stats" ("col1"), but there is an existing reference on this column. You must either add a UNIQUE constraint to ("col1") or drop the foreign key constraint that references this column.',
	}]);

	const expectedSql2: string[] = [
		'ALTER TABLE `table2` DROP CONSTRAINT `table2_teamStatsCol1_team_stats_col1_fkey`;',
		'ALTER TABLE `team_stats` DROP PRIMARY KEY;',
		'ALTER TABLE `team_stats` MODIFY COLUMN `col1` int;',
		'ALTER TABLE `team_stats` ADD PRIMARY KEY (`col2`,`col3`);',
		'ALTER TABLE `table2` ADD CONSTRAINT `table2_teamStatsCol1_team_stats_col1_fkey` FOREIGN KEY (`teamStatsCol1`) REFERENCES `team_stats`(`col1`);',
	];
	expect(st2).toStrictEqual(expectedSql2);
	expect(pst2).toStrictEqual(expectedSql2);
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
		authors: mysqlTable('authors', {
			publicationId: varchar('publication_id', { length: 64 }),
			authorID: varchar('author_id', { length: 10 }),
		}, (table) => [primaryKey({ columns: [table.publicationId, table.authorID] })]),
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
		authors: mysqlTable('authors', {
			publicationId: varchar('publication_id', { length: 64 }),
			authorID: varchar('author_id', { length: 10 }),
			orcidId: varchar('orcid_id', { length: 64 }),
		}, (table) => [
			primaryKey({ columns: [table.publicationId, table.authorID, table.orcidId] }),
		]),
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
