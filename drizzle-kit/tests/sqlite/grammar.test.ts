import { parseSqliteDdl, parseSqliteIndex, parseViewSQL } from 'src/dialects/sqlite/grammar';
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

	test('index #1', () => {
		const ddl = 'CREATE INDEX \`idx_test\` ON' + '\n'
			+ '\`table_name\` (id, name) WHERE (status = 1)';

		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx_test',
			table: 'table_name',
			unique: false,
			columns: ['id', 'name'],
			where: 'status = 1',
		});
	});
	test('index #2', () => {
		const ddl = 'CREATE INDEX "my-index" ON "my-table" ("column one", "column two");';

		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'my-index',
			table: 'my-table',
			unique: false,
			columns: ['column one', 'column two'],
			where: null,
		});
	});
	test('index #3', () => {
		const ddl = "CREATE INDEX idx ON t (coalesce(nullif(a, ''), b));";

		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx',
			table: 't',
			unique: false,
			columns: ["coalesce(nullif(a, ''), b)"],
			where: null,
		});
	});
	test('index #4', () => {
		const ddl = 'CREATE INDEX IF NOT EXISTS idx ON t (a, b) WHERE c IN (1, 2, 3);';

		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx',
			table: 't',
			unique: false,
			columns: ['a', 'b'],
			where: 'c IN (1, 2, 3)',
		});
	});
	test('index #5', () => {
		const ddl = "CREATE INDEX idx ON t (a, b) WHERE (c = 'test()()(param)');";

		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx',
			table: 't',
			unique: false,
			columns: ['a', 'b'],
			where: "c = 'test()()(param)'",
		});
	});
	test('index #6', () => {
		const ddl = 'CREATE UNIQUE INDEX idx_users_name_lower ON users (lower(first_name), lower(last_name));';

		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx_users_name_lower',
			table: 'users',
			unique: true,
			columns: ['lower(first_name)', 'lower(last_name)'],
			where: null,
		});
	});
	test('index #7', () => {
		const ddl = 'CREATE UNIQUE INDEX idx_users_name_lower ON users (upper(lower(first_name)), lower(last_name));';

		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx_users_name_lower',
			table: 'users',
			unique: true,
			columns: ['upper(lower(first_name))', 'lower(last_name)'],
			where: null,
		});
	});
	test('index #8', () => {
		const ddl = `
			CREATE UNIQUE INDEX idx_complex
			ON users (lower(email), coalesce(name, ''))
			WHERE deleted_at IS NULL;
		`;

		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx_complex',
			table: 'users',
			unique: true,
			columns: ['lower(email)', "coalesce(name, '')"],
			where: 'deleted_at IS NULL',
		});
	});
	test('index #9', () => {
		const ddl1 = 'CREATE INDEX broken ON users email);';
		expect(parseSqliteIndex(ddl1)).toStrictEqual(null);

		const ddl2 = 'CREATE INDEX broken ON users (email;';
		expect(parseSqliteIndex(ddl2)).toStrictEqual(null);

		const ddl3 = 'CREATE INDEX broken ON users email;';
		expect(parseSqliteIndex(ddl3)).toStrictEqual(null);
	});
	test('index #10', () => {
		const ddl = 'CREATE INDEX idx_sort ON test (first_name DESC)';
		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx_sort',
			table: 'test',
			unique: false,
			columns: ['first_name DESC'],
			where: null,
		});
	});
	test('index #11', () => {
		const ddl = 'CREATE INDEX idx_collate ON users (email COLLATE NOCASE);';
		expect(parseSqliteIndex(ddl)).toStrictEqual({
			name: 'idx_collate',
			table: 'users',
			unique: false,
			columns: ['email COLLATE NOCASE'],
			where: null,
		});
	});
});
