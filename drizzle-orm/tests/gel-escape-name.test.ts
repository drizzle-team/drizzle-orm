import { describe, expect, it } from 'vitest';
import { GelDialect } from '~/gel-core/dialect.ts';
import { sql } from '~/sql/sql.ts';

describe('GelDialect escapeName', () => {
	it('doubles embedded double quotes instead of passing them through (CVE-2026-39356)', () => {
		const dialect = new GelDialect();

		const userInput = 'id" ASC, CAST((SELECT name FROM users LIMIT 1) AS int)--';

		const query = sql`SELECT * FROM ${sql.identifier('users')} ORDER BY ${sql.identifier(userInput)} ASC`;

		const { sql: str } = dialect.sqlToQuery(query);
		expect(str).toBe(
			'SELECT * FROM "users" ORDER BY "id"" ASC, CAST((SELECT name FROM users LIMIT 1) AS int)--" ASC',
		);
	});

	it('still escapes simple identifiers correctly', () => {
		const dialect = new GelDialect();
		expect(dialect.escapeName('users')).toBe('"users"');
		expect(dialect.escapeName('weird"name')).toBe('"weird""name"');
	});
});
