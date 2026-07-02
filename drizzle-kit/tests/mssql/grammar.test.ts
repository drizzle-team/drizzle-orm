import { parseViewSQL } from 'src/dialects/mssql/grammar';
import { expect, test } from 'vitest';

// https://github.com/drizzle-team/drizzle-orm/issues/5964
test.each([
	[
		'plain view',
		'CREATE VIEW dbo.vCustomer AS\nSELECT CustomerId, [Name] FROM dbo.Customer',
		'SELECT CustomerId, [Name] FROM dbo.Customer',
	],
	[
		'block comment between AS and SELECT',
		'CREATE VIEW dbo.vCustomer WITH SCHEMABINDING AS\n/* comment */\nSELECT CustomerId,\n       [Name]\n  FROM dbo.Customer',
		'SELECT CustomerId,\n       [Name]\n  FROM dbo.Customer',
	],
	[
		'line comment between AS and SELECT',
		'CREATE VIEW dbo.vCustomer AS\n-- comment\nSELECT CustomerId FROM dbo.Customer',
		'SELECT CustomerId FROM dbo.Customer',
	],
	[
		'mixed comments between AS and SELECT',
		'CREATE VIEW dbo.vCustomer AS /* a */ -- b\n/* c */ SELECT CustomerId FROM dbo.Customer',
		'SELECT CustomerId FROM dbo.Customer',
	],
	[
		'parenthesized body',
		'CREATE VIEW dbo.vCustomer AS (SELECT CustomerId FROM dbo.Customer)',
		'SELECT CustomerId FROM dbo.Customer',
	],
	[
		'comment inside parenthesized body',
		'CREATE VIEW dbo.vCustomer AS ( /* comment */ SELECT CustomerId FROM dbo.Customer)',
		'SELECT CustomerId FROM dbo.Customer',
	],
	[
		'with check option',
		'CREATE VIEW dbo.vCustomer AS SELECT CustomerId FROM dbo.Customer WITH CHECK OPTION',
		'SELECT CustomerId FROM dbo.Customer',
	],
	[
		'comment before body with check option',
		'CREATE VIEW dbo.vCustomer AS /* comment */ SELECT CustomerId FROM dbo.Customer WITH CHECK OPTION',
		'SELECT CustomerId FROM dbo.Customer',
	],
	[
		'cte body',
		'CREATE VIEW dbo.vCustomer AS WITH cte AS (SELECT 1 AS x) SELECT * FROM cte',
		'WITH cte AS (SELECT 1 AS x) SELECT * FROM cte',
	],
	[
		'comment between AS and cte body',
		'CREATE VIEW dbo.vCustomer AS /* comment */ WITH cte AS (SELECT 1 AS x) SELECT * FROM cte',
		'WITH cte AS (SELECT 1 AS x) SELECT * FROM cte',
	],
	[
		'trailing semicolon',
		'CREATE VIEW dbo.vCustomer AS SELECT CustomerId FROM dbo.Customer;',
		'SELECT CustomerId FROM dbo.Customer',
	],
	[
		'column alias does not anchor the match',
		'CREATE VIEW dbo.vCustomer AS SELECT CustomerId AS id FROM dbo.Customer',
		'SELECT CustomerId AS id FROM dbo.Customer',
	],
])('parseViewSQL: %s', (_, sql, expected) => {
	expect(parseViewSQL(sql)).toBe(expected);
});

test('parseViewSQL: null definition means encrypted view', () => {
	expect(parseViewSQL(null)).toBe('');
});

test('parseViewSQL: non-view sql returns null', () => {
	expect(parseViewSQL('not a view definition')).toBe(null);
});
