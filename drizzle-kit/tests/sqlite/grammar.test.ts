import { parseSqliteDdl, parseViewSQL } from 'src/dialects/sqlite/grammar';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { prepareTestDatabase, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(() => {
	_ = prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('view definition', () => {
	parseViewSQL('CREATE VIEW current_cycle AS\nSELECT\n* from users;');
});

describe('parse ddl', (t) => {
	test('all uniques', async () => {
		const ddl = 'CREATE TABLE \`users\` (' + '\n'
			+ '\`column\` text,' + '\n'
			+ '\`column1\` text,' + '\n'
			+ '\`column2\` text,' + '\n'
			+ '\`column3\` text,' + '\n'
			+ '\`column4\` text UNIQUE,' + '\n'
			+ '\`column5\` text CONSTRAINT [hey] UNIQUE,' + '\n'
			+ '\`column6\` text,' + '\n'
			+ 'CONSTRAINT [unique_name] UNIQUE(\`column\`),' + '\n'
			+ 'CONSTRAINT unique_name1 UNIQUE(\`column1\`),' + '\n'
			+ 'CONSTRAINT "unique_name2" UNIQUE(\`column2\`),' + '\n'
			+ 'CONSTRAINT \`unique_name3\` UNIQUE(\`column3\`)' + '\n'
			+ ')';

		await db.run(ddl);

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [
				{ name: 'unique_name', columns: ['column'] },
				{ name: 'unique_name1', columns: ['column1'] },
				{ name: 'unique_name2', columns: ['column2'] },
				{ name: 'unique_name3', columns: ['column3'] },
				{ name: null, columns: ['column4'] },
				{ name: 'hey', columns: ['column5'] },
			],
			pk: { name: null, columns: [] },
		});
	});

	test('corner case uniques', async () => {
		const ddl = 'CREATE TABLE \`users\` (' + '\n'
			+ '\`column\` text,' + '\n'
			+ '\`column1\` text,' + '\n'
			+ '\`column2\` text,' + '\n'
			+ '\`column3\` text,'
			+ '\`column4\` \ntext UNIQUE,' + '\n'
			+ '\`column5\` text \nCONSTRAINT [hey] \tUNIQUE\n\t,' + '\n'
			+ '\`column6\` text \nCONSTRAINT "hey" \tUNIQUE\n\t,' + '\n'
			+ '\`column7\` text \nCONSTRAINT \`hey\` \tUNIQUE\n\t,' + '\n'
			+ '\`column8\` text \nCONSTRAINT hey \tUNIQUE\n\t,' + '\n'
			+ '\`column9\` text,' + '\n'
			+ 'CONSTRAINT\n\t [unique_name] UNIQUE\n(\`column\`),'
			+ 'CONSTRAINT unique_name1 UNIQUE(\`column1\`),' + '\n'
			+ 'CONSTRAINT "unique_name2"\n UNIQUE(\`column2\`),' + '\n'
			+ 'CONSTRAINT \`unique_name3\` UNIQUE(\`column3\`)' + '\n'
			+ ')';

		await db.run(ddl);

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [
				{ name: 'unique_name', columns: ['column'] },
				{ name: 'unique_name1', columns: ['column1'] },
				{ name: 'unique_name2', columns: ['column2'] },
				{ name: 'unique_name3', columns: ['column3'] },
				{ name: null, columns: ['column4'] },
				{ name: 'hey', columns: ['column5'] },
				{ name: 'hey', columns: ['column6'] },
				{ name: 'hey', columns: ['column7'] },
				{ name: 'hey', columns: ['column8'] },
			],
			pk: { name: null, columns: [] },
		});
	});

	test('pk #1', () => {
		const ddl = 'CREATE TABLE \`users\` (' + '\n'
			+ '\`column\` text' + '\n'
			+ 'CONSTRAINT [pk] PRIMARY KEY(\`column\`)' + '\n'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: { name: 'pk', columns: ['column'] },
		});
	});
	test('pk #2', () => {
		const ddl = 'CREATE TABLE \`users\` (' + '\n'
			+ '\`column\` text' + '\n'
			+ 'CONSTRAINT pk PRIMARY KEY(\`column\`)' + '\n'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: { name: 'pk', columns: ['column'] },
		});
	});
	test('pk #3', () => {
		const ddl = 'CREATE TABLE \`users\` (' + '\n'
			+ '\`column\` text' + '\n'
			+ 'CONSTRAINT "pk" PRIMARY KEY(\`column\`)' + '\n'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: { name: 'pk', columns: ['column'] },
		});
	});
	test('pk #4', () => {
		const ddl = 'CREATE TABLE \`users\` (' + '\n'
			+ '\`column\` text' + '\n'
			+ 'CONSTRAINT `pk` PRIMARY KEY(\`column\`)' + '\n'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: { name: 'pk', columns: ['column'] },
		});
	});
	test('pk #5', () => {
		const ddl = 'CREATE TABLE \`users\` (' + '\n'
			+ '\`column\` text PRIMARY KEY'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: {
				name: null,
				columns: [`column`],
			},
		});
	});
	test('pk #6', () => {
		const ddl = 'CREATE TABLE \`users\` (' + '\n'
			+ '\`column\` text CONSTRAINT "pk" PRIMARY KEY'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: {
				name: 'pk',
				columns: [`column`],
			},
		});
	});
});
