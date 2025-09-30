import { sql } from 'drizzle-orm';
import {
	AnyMySqlColumn,
	bigint,
	binary,
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
	mediumint,
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	primaryKey,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
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
		'CREATE TABLE `users3` (\n\t`c1` varchar(100),\n\tCONSTRAINT `c1_unique` UNIQUE(`c1`)\n);',
		'CREATE TABLE `users4` (\n\t`c1` varchar(100),\n\t`c2` varchar(100),\n\tCONSTRAINT `c1_unique` UNIQUE(`c1`)\n);',
		'ALTER TABLE `users4` ADD CONSTRAINT `users4_c1_users3_c1_fk` FOREIGN KEY (`c1`) REFERENCES `users3`(`c1`);',
		'ALTER TABLE `users4` ADD CONSTRAINT `users4_c2_users4_c1_fk` FOREIGN KEY (`c2`) REFERENCES `users4`(`c1`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
