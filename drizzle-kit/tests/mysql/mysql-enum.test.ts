import { int, mysqlEnum, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { Decimal, parseEnum } from 'src/dialects/mysql/grammar';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, diffIntrospect, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;
let db: DB;

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

if (!fs.existsSync('tests/mysql/tmp')) {
	fs.mkdirSync('tests/mysql/tmp', { recursive: true });
}

// https://github.com/drizzle-team/drizzle-orm/issues/3613
test('enum', async () => {
	const ORDER_STATUSES = [
		'Ny',
		'Bestilling sendt',
		'Sendt til leverandør(er)',
		'Mottatt av leverandør(er)',
		'Behandlet av leverandør(er)',
		'Under behandling',
		'Noe gikk galt',
	] as const;
	const schema1 = {
		table: mysqlTable('table', {
			status: mysqlEnum('status', ORDER_STATUSES).default('Sendt til leverandør(er)'),
		}),
	};

	const { sqlStatements: st } = await diff({}, schema1, []);
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	const st0: string[] = [
		"CREATE TABLE `table` (\n\t`status` enum('Ny','Bestilling sendt','Sendt til leverandør(er)','Mottatt av leverandør(er)','Behandlet av leverandør(er)','Under behandling','Noe gikk galt') DEFAULT 'Sendt til leverandør(er)'\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop enum value. column of enum type; drop default', async () => {
	const from = {
		table: mysqlTable('table', {
			column: mysqlEnum('column', ['value1', 'value2', 'value3']).default('value2'),
		}),
	};

	const to = {
		table: mysqlTable('table', {
			column: mysqlEnum('column', ['value1', 'value3']),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		"ALTER TABLE `table` MODIFY COLUMN `column` enum('value1','value3');",
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
