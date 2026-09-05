import { parseSqliteDdl, parseSqliteIndex, parseViewSQL, stripSqlComments } from 'src/dialects/sqlite/grammar';
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

describe('parseSqliteIndex', () => {
	test('plain columns', () => {
		expect(parseSqliteIndex('CREATE INDEX `idx` ON `table` (`col1`, `col2`)')).toStrictEqual({
			columns: ['`col1`', '`col2`'],
			where: null,
		});
	});

	test('expression columns', () => {
		expect(parseSqliteIndex('CREATE UNIQUE INDEX "idx" ON "table" (lower("col1"), "col2")')).toStrictEqual({
			columns: ['lower("col1")', '"col2"'],
			where: null,
		});
	});

	test('predicate of a partial index', () => {
		expect(parseSqliteIndex('CREATE INDEX idx ON t (c1) WHERE c1 > 3 AND c2 IN (1, 2);')).toStrictEqual({
			columns: ['c1'],
			where: 'c1 > 3 AND c2 IN (1, 2)',
		});
	});

	test('keeps commas of expressions and literals', () => {
		expect(parseSqliteIndex(`CREATE INDEX idx ON "my(table)" (a, coalesce(b, 'x, y'))`)).toStrictEqual({
			columns: ['a', `coalesce(b, 'x, y')`],
			where: null,
		});
	});

	test('predicate is only what follows the column list', () => {
		expect(parseSqliteIndex(`CREATE INDEX idx ON t (lower('a where b'))`)).toStrictEqual({
			columns: [`lower('a where b')`],
			where: null,
		});
		expect(parseSqliteIndex(`CREATE INDEX idx ON t (lower('a where b')) WHERE c <> 'c where d'`)).toStrictEqual({
			columns: [`lower('a where b')`],
			where: `c <> 'c where d'`,
		});
	});

	test('ignores comments', () => {
		expect(parseSqliteIndex('CREATE INDEX idx ON t /* c1, */ (c1) -- WHERE c2')).toStrictEqual({
			columns: ['c1'],
			where: null,
		});
	});

	test('statement without a column list', () => {
		expect(parseSqliteIndex('CREATE INDEX idx ON t')).toStrictEqual({ columns: [], where: null });
	});
});

describe('parseSqliteDdl checks', () => {
	test('unnamed table-level check', async () => {
		const ddl = 'CREATE TABLE t (a INTEGER, CHECK (a > 0))';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([{ name: null, value: 'a > 0' }]);
	});

	test('named check', async () => {
		const ddl = 'CREATE TABLE t (a INTEGER, CONSTRAINT ck CHECK (a > 0))';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([{ name: 'ck', value: 'a > 0' }]);
	});

	test('inline column check without a space before the paren', async () => {
		const ddl = "CREATE TABLE t (a TEXT CHECK(a <> ''))";
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([{ name: null, value: "a <> ''" }]);
	});

	test('multiple checks on one table', async () => {
		const ddl = 'CREATE TABLE t (a INTEGER, CHECK (a > 0), CHECK (a < 10))';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([
			{ name: null, value: 'a > 0' },
			{ name: null, value: 'a < 10' },
		]);
	});

	test('multiline check is collapsed and trimmed', async () => {
		const ddl = 'CREATE TABLE t (b INTEGER, CHECK (\n  b > 0\n))';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([{ name: null, value: 'b > 0' }]);
	});

	test('mixes named + inline + table-level checks', async () => {
		const ddl = "CREATE TABLE t (a TEXT CHECK(a <>\n ''), b INTEGER, CONSTRAINT ck CHECK (b > 0))";
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([
			{ name: null, value: "a <> ''" },
			{ name: 'ck', value: 'b > 0' },
		]);
	});

	test('nested function calls in the expression', async () => {
		const ddl = 'CREATE TABLE t (name TEXT, CHECK (length(trim(name)) > 0))';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([{ name: null, value: 'length(trim(name)) > 0' }]);
	});

	test('parenthesised sub-expression', async () => {
		const ddl = 'CREATE TABLE t (a INTEGER, b INTEGER, CHECK ((a + b) > 0))';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([{ name: null, value: '(a + b) > 0' }]);
	});

	test('named checks with bracket, double-quote and backtick names', async () => {
		const ddl = 'CREATE TABLE t (a INTEGER, CONSTRAINT [ck1] CHECK (a > 0), '
			+ 'CONSTRAINT "ck2" CHECK (a < 5), CONSTRAINT `ck3` CHECK (a <> 3))';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([
			{ name: 'ck1', value: 'a > 0' },
			{ name: 'ck2', value: 'a < 5' },
			{ name: 'ck3', value: 'a <> 3' },
		]);
	});

	test('commas inside the expression do not break column parsing', async () => {
		const ddl = "CREATE TABLE t (status TEXT CHECK (status IN ('a', 'b', 'c')), name TEXT UNIQUE)";
		await db.run(ddl);
		expect(parseSqliteDdl(ddl)).toStrictEqual({
			checks: [{ name: null, value: "status IN ('a', 'b', 'c')" }],
			uniques: [{ name: null, columns: ['name'] }],
			pk: { name: null, columns: [] },
		});
	});

	test('UNIQUE keyword inside a check is not treated as a unique constraint', async () => {
		const ddl = "CREATE TABLE t (role TEXT CHECK (role <> 'UNIQUE'), name TEXT)";
		await db.run(ddl);
		expect(parseSqliteDdl(ddl)).toStrictEqual({
			checks: [{ name: null, value: "role <> 'UNIQUE'" }],
			uniques: [],
			pk: { name: null, columns: [] },
		});
	});

	test('checks mixed with uniques and a primary key', async () => {
		const ddl = 'CREATE TABLE t (id INTEGER, a INTEGER, '
			+ 'CONSTRAINT pk PRIMARY KEY(id), CONSTRAINT uq UNIQUE(a), CHECK (a > 0))';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl)).toStrictEqual({
			checks: [{ name: null, value: 'a > 0' }],
			uniques: [{ name: 'uq', columns: ['a'] }],
			pk: { name: 'pk', columns: ['id'] },
		});
	});

	test('no checks', async () => {
		const ddl = 'CREATE TABLE t (a INTEGER, b TEXT)';
		await db.run(ddl);
		expect(parseSqliteDdl(ddl).checks).toStrictEqual([]);
	});
});

describe('parseSqliteDdl ignores commented-out checks', () => {
	test('line-commented check is ignored', () => {
		const sql = 'CREATE TABLE users (\n'
			+ '  id TEXT PRIMARY KEY,\n'
			+ "  -- CHECK (userType IN ('anonymous', 'emailPassword'))\n"
			+ '  userType TEXT NOT NULL\n'
			+ ')';
		expect(parseSqliteDdl(sql).checks).toStrictEqual([]);
	});

	test('block-commented check is ignored', () => {
		const sql = 'CREATE TABLE users (\n'
			+ '  id TEXT PRIMARY KEY,\n'
			+ '  /* CONSTRAINT users_ck CHECK (length(userType) > 0) */\n'
			+ '  userType TEXT NOT NULL\n'
			+ ')';
		expect(parseSqliteDdl(sql).checks).toStrictEqual([]);
	});

	test('real check is still parsed alongside a commented-out one', () => {
		const sql = 'CREATE TABLE users (\n'
			+ '  id TEXT PRIMARY KEY,\n'
			+ "  -- CHECK (userType IN ('x'))\n"
			+ "  userType TEXT NOT NULL CHECK (userType <> '')\n"
			+ ')';
		expect(parseSqliteDdl(sql).checks).toStrictEqual([
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
		const ddl = 'CREATE TABLE `users` (' + '\n'
			+ '`column` text,' + '\n'
			+ '`column1` text,' + '\n'
			+ '`column2` text,' + '\n'
			+ '`column3` text,' + '\n'
			+ '`column4` text UNIQUE,' + '\n'
			+ '`column5` text CONSTRAINT [hey] UNIQUE,' + '\n'
			+ '`column6` text,' + '\n'
			+ 'CONSTRAINT [unique_name] UNIQUE(`column`),' + '\n'
			+ 'CONSTRAINT unique_name1 UNIQUE(`column1`),' + '\n'
			+ 'CONSTRAINT "unique_name2" UNIQUE(`column2`),' + '\n'
			+ 'CONSTRAINT `unique_name3` UNIQUE(`column3`)' + '\n'
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
			checks: [],
		});
	});

	test('corner case uniques', async () => {
		const ddl = 'CREATE TABLE `users` (' + '\n'
			+ '`column` text,' + '\n'
			+ '`column1` text,' + '\n'
			+ '`column2` text,' + '\n'
			+ '`column3` text,'
			+ '`column4` \ntext UNIQUE,' + '\n'
			+ '`column5` text \nCONSTRAINT [hey] \tUNIQUE\n\t,' + '\n'
			+ '`column6` text \nCONSTRAINT "hey" \tUNIQUE\n\t,' + '\n'
			+ '`column7` text \nCONSTRAINT `hey` \tUNIQUE\n\t,' + '\n'
			+ '`column8` text \nCONSTRAINT hey \tUNIQUE\n\t,' + '\n'
			+ '`column9` text,' + '\n'
			+ 'CONSTRAINT\n\t [unique_name] UNIQUE\n(`column`),'
			+ 'CONSTRAINT unique_name1 UNIQUE(`column1`),' + '\n'
			+ 'CONSTRAINT "unique_name2"\n UNIQUE(`column2`),' + '\n'
			+ 'CONSTRAINT `unique_name3` UNIQUE(`column3`)' + '\n'
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
			checks: [],
		});
	});

	test('pk #1', () => {
		const ddl = 'CREATE TABLE `users` (' + '\n'
			+ '`column` text' + '\n'
			+ 'CONSTRAINT [pk] PRIMARY KEY(`column`)' + '\n'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: { name: 'pk', columns: ['column'] },
			checks: [],
		});
	});
	test('pk #2', () => {
		const ddl = 'CREATE TABLE `users` (' + '\n'
			+ '`column` text' + '\n'
			+ 'CONSTRAINT pk PRIMARY KEY(`column`)' + '\n'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: { name: 'pk', columns: ['column'] },
			checks: [],
		});
	});
	test('pk #3', () => {
		const ddl = 'CREATE TABLE `users` (' + '\n'
			+ '`column` text' + '\n'
			+ 'CONSTRAINT "pk" PRIMARY KEY(`column`)' + '\n'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: { name: 'pk', columns: ['column'] },
			checks: [],
		});
	});
	test('pk #4', () => {
		const ddl = 'CREATE TABLE `users` (' + '\n'
			+ '`column` text' + '\n'
			+ 'CONSTRAINT `pk` PRIMARY KEY(`column`)' + '\n'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: { name: 'pk', columns: ['column'] },
			checks: [],
		});
	});
	test('pk #5', () => {
		const ddl = 'CREATE TABLE `users` (' + '\n'
			+ '`column` text PRIMARY KEY'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: {
				name: null,
				columns: [`column`],
			},
			checks: [],
		});
	});
	test('pk #6', () => {
		const ddl = 'CREATE TABLE `users` (' + '\n'
			+ '`column` text CONSTRAINT "pk" PRIMARY KEY'
			+ ')';

		expect(parseSqliteDdl(ddl)).toStrictEqual({
			uniques: [],
			pk: {
				name: 'pk',
				columns: [`column`],
			},
			checks: [],
		});
	});
});
