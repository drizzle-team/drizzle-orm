import { parseSqliteDdl, parseTableSQL, parseViewSQL, stripSqlComments } from 'src/dialects/sqlite/grammar';
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

describe('stripSqlComments', () => {
	test('removes line comments', () => {
		expect(stripSqlComments('id TEXT -- primary key\n, name TEXT')).toBe('id TEXT \n, name TEXT');
	});

	test('removes line comment at end of input (no trailing newline)', () => {
		expect(stripSqlComments('id TEXT -- trailing')).toBe('id TEXT ');
	});

	test('removes block comments', () => {
		expect(stripSqlComments('id TEXT /* a check */, name TEXT')).toBe('id TEXT , name TEXT');
	});

	test('removes multiline block comments', () => {
		expect(stripSqlComments('id TEXT /* line1\nline2 */, name TEXT')).toBe('id TEXT , name TEXT');
	});

	test('keeps `--` inside single-quoted string literals', () => {
		expect(stripSqlComments("CHECK (name <> 'a -- b')")).toBe("CHECK (name <> 'a -- b')");
	});

	test('keeps block-comment markers inside string literals', () => {
		expect(stripSqlComments("CHECK (name <> '     /* not a comment */\n')")).toBe(
			"CHECK (name <> '     /* not a comment */\n')",
		);
	});

	test('keeps `--` inside double-quoted identifiers', () => {
		expect(stripSqlComments('"weird -- column" TEXT')).toBe('"weird -- column" TEXT');
	});

	test('keeps `--` inside backtick identifiers', () => {
		expect(stripSqlComments('`weird -- column` TEXT')).toBe('`weird -- column` TEXT');
	});

	test('keeps `--` inside bracket identifiers', () => {
		expect(stripSqlComments('[weird -- column] TEXT')).toBe('[weird -- column] TEXT');
	});

	test('handles doubled single quotes inside string literals', () => {
		expect(stripSqlComments("CHECK (name <> 'it''s -- fine')")).toBe("CHECK (name <> 'it''s -- fine')");
	});

	test('leaves comment-free sql untouched', () => {
		const sql = 'CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)';
		expect(stripSqlComments(sql)).toBe(sql);
	});
});

describe('parseTableSQL ignores commented-out constraints', () => {
	test('line-commented check is ignored', () => {
		const sql = 'CREATE TABLE users (\n'
			+ '  id TEXT PRIMARY KEY,\n'
			+ "  -- CHECK (userType IN ('anonymous', 'emailPassword'))\n"
			+ '  userType TEXT NOT NULL\n'
			+ ')';
		expect(parseTableSQL(sql).checks).toStrictEqual([]);
	});

	test('block-commented check is ignored', () => {
		const sql = 'CREATE TABLE users (\n'
			+ '  id TEXT PRIMARY KEY,\n'
			+ '  /* CONSTRAINT users_ck CHECK (length(userType) > 0) */\n'
			+ '  userType TEXT NOT NULL\n'
			+ ')';
		expect(parseTableSQL(sql).checks).toStrictEqual([]);
	});

	test('real check is still parsed', () => {
		const sql = 'CREATE TABLE users (\n'
			+ '  id TEXT PRIMARY KEY,\n'
			+ "  -- CHECK (userType IN ('x'))\n"
			+ "  userType TEXT NOT NULL CHECK (userType <> '')\n"
			+ ')';
		expect(parseTableSQL(sql).checks).toStrictEqual([
			{ name: null, value: "userType <> ''" },
		]);
	});
});

describe('parseSqliteDdl ignores commented-out constraints', () => {
	test('line-commented unique is ignored', () => {
		const ddl = 'CREATE TABLE `users` (\n'
			+ '`id` text PRIMARY KEY,\n'
			+ '-- CONSTRAINT uq UNIQUE (`id`)\n'
			+ '`name` text\n'
			+ ')';
		expect(parseSqliteDdl(ddl).uniques).toStrictEqual([]);
	});

	test('block-commented unique is ignored', () => {
		const ddl = 'CREATE TABLE `users` (\n'
			+ '`id` text,\n'
			+ '/* CONSTRAINT uq UNIQUE (`id`) \n'
			+ '*/ \n'
			+ '`name` text\n'
			+ ')';
		expect(parseSqliteDdl(ddl).uniques).toStrictEqual([]);
	});
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
