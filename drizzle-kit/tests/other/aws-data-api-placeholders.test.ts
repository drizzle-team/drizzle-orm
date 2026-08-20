import { prepareAwsDataApiSql } from 'src/utils/aws-data-api-placeholders';
import { describe, expect, test } from 'vitest';

describe('prepareAwsDataApiSql', () => {
	test('returns the SQL untouched when there are no parameters', () => {
		const sql = 'select * from users where id = $1';
		expect(prepareAwsDataApiSql(sql, 0)).toBe(sql);
	});

	test('rewrites a single placeholder', () => {
		expect(prepareAwsDataApiSql('select * from users where id = $1', 1))
			.toBe('select * from users where id = :1');
	});

	test('rewrites several placeholders, in any order', () => {
		expect(prepareAwsDataApiSql('select * from users where id = $2 and org = $1', 2))
			.toBe('select * from users where id = :2 and org = :1');
	});

	test('rewrites a placeholder used more than once', () => {
		expect(prepareAwsDataApiSql('select $1, $1', 1)).toBe('select :1, :1');
	});

	test('rewrites a placeholder at the very end of the string', () => {
		expect(prepareAwsDataApiSql('select $1', 1)).toBe('select :1');
	});

	test('rewrites a two-digit placeholder', () => {
		expect(prepareAwsDataApiSql('select $10', 10)).toBe('select :10');
	});

	test('leaves a placeholder index beyond the parameter count alone', () => {
		expect(prepareAwsDataApiSql('select $1, $9', 1)).toBe('select :1, $9');
	});

	test('leaves $0 alone, since Postgres placeholders are one-based', () => {
		expect(prepareAwsDataApiSql('select $0, $1', 1)).toBe('select $0, :1');
	});

	test('leaves a lone $ alone', () => {
		expect(prepareAwsDataApiSql('select $ , $1', 1)).toBe('select $ , :1');
	});

	test('does not touch a $N inside a single-quoted string', () => {
		expect(prepareAwsDataApiSql("select '$1' , $1", 1)).toBe("select '$1' , :1");
	});

	test('handles a doubled quote inside a single-quoted string', () => {
		expect(prepareAwsDataApiSql("select 'it''s $1' , $1", 1)).toBe("select 'it''s $1' , :1");
	});

	test('handles a backslash-escaped quote inside an E-string', () => {
		expect(prepareAwsDataApiSql("select e'it\\'s $1' , $1", 1)).toBe("select e'it\\'s $1' , :1");
	});

	test('does not treat a quote after an identifier ending in e as an E-string', () => {
		expect(prepareAwsDataApiSql("select type'\\' , $1", 1)).toBe("select type'\\' , :1");
	});

	test('does not touch a $N inside an untagged dollar-quoted body', () => {
		expect(prepareAwsDataApiSql('select $$ $1 $$ , $1', 1)).toBe('select $$ $1 $$ , :1');
	});

	test('does not touch a $N inside a tagged dollar-quoted body', () => {
		expect(prepareAwsDataApiSql('select $body$ $1 $body$ , $1', 1))
			.toBe('select $body$ $1 $body$ , :1');
	});

	test('treats an unterminated dollar-quoted body as running to the end', () => {
		expect(prepareAwsDataApiSql('select $$ $1', 1)).toBe('select $$ $1');
	});

	test('does not touch a $N inside a line comment', () => {
		expect(prepareAwsDataApiSql('select $1 -- $1\nfrom t where a = $1', 1))
			.toBe('select :1 -- $1\nfrom t where a = :1');
	});

	test('does not touch a $N inside a block comment', () => {
		expect(prepareAwsDataApiSql('select /* $1 */ $1', 1)).toBe('select /* $1 */ :1');
	});

	test('handles nested block comments', () => {
		expect(prepareAwsDataApiSql('select /* a /* $1 */ b */ $1', 1))
			.toBe('select /* a /* $1 */ b */ :1');
	});

	test('does not touch a $N inside a quoted identifier', () => {
		expect(prepareAwsDataApiSql('select "a $1 b" from t where c = $1', 1))
			.toBe('select "a $1 b" from t where c = :1');
	});

	test('does not touch a $ inside a bare identifier', () => {
		expect(prepareAwsDataApiSql('select foo$1 from t where c = $1', 1))
			.toBe('select foo$1 from t where c = :1');
	});

	test('does not touch a $ inside a non-ASCII bare identifier', () => {
		expect(prepareAwsDataApiSql('select é$1 from t where c = $1', 1))
			.toBe('select é$1 from t where c = :1');
	});

	test('does not touch a $N inside a body with a non-ASCII dollar-quote tag', () => {
		expect(prepareAwsDataApiSql('select $é$ $1 $é$ , $1', 1)).toBe('select $é$ $1 $é$ , :1');
	});

	test('ends a line comment at a carriage return', () => {
		expect(prepareAwsDataApiSql('select $1 -- $1\r, $1', 1)).toBe('select :1 -- $1\r, :1');
	});

	test('keeps escape-string semantics across a continued string constant', () => {
		expect(prepareAwsDataApiSql("select E'a'\n'it\\'s $1' , $1", 1))
			.toBe("select E'a'\n'it\\'s $1' , :1");
	});

	test('keeps escape-string semantics across a continuation separated by a line comment', () => {
		expect(prepareAwsDataApiSql("select E'a'\n-- c\n'it\\'s $1' , $1", 1))
			.toBe("select E'a'\n-- c\n'it\\'s $1' , :1");
	});

	test('treats a comment that carries the newline as continuation whitespace', () => {
		expect(prepareAwsDataApiSql("select E'a' -- c\n'it\\'s $1' , $1", 1))
			.toBe("select E'a' -- c\n'it\\'s $1' , :1");
	});

	test('does not continue a string when the gap has no newline', () => {
		expect(prepareAwsDataApiSql("select 'a' 'b' , $1", 1)).toBe("select 'a' 'b' , :1");
	});

	test('rewrites a placeholder in a cast-bearing count query', () => {
		expect(
			prepareAwsDataApiSql('select count(*)::text as n from regions where country_code = $1', 1),
		).toBe('select count(*)::text as n from regions where country_code = :1');
	});

	test('rewrites placeholders in a multi-line introspection query', () => {
		const sql = `SELECT conname AS primary_key
FROM pg_constraint join pg_class on (pg_class.oid = conrelid)
WHERE contype = 'p'
AND connamespace = $1::regnamespace
AND pg_class.relname = $2;`;

		expect(prepareAwsDataApiSql(sql, 2)).toBe(
			`SELECT conname AS primary_key
FROM pg_constraint join pg_class on (pg_class.oid = conrelid)
WHERE contype = 'p'
AND connamespace = :1::regnamespace
AND pg_class.relname = :2;`,
		);
	});
});
