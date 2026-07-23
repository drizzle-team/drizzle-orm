import { describe, expect, it } from 'vitest';
import { PgDialect } from '~/pg-core/dialect';
import { eq, isNotNull, isNull } from '~/sql/expressions/conditions';
import { type SQL, sql } from '~/sql/sql';

describe('isNull / isNotNull parenthesization (#6010)', () => {
	const dialect = new PgDialect();
	const render = (query: SQL) => dialect.sqlToQuery(query).sql;

	it('wraps the expression so it is safe as an operand', () => {
		expect(render(isNull(sql`"a"`))).toBe('("a" is null)');
		expect(render(isNotNull(sql`"a"`))).toBe('("a" is not null)');
	});

	it('keeps operator precedence when compared via eq', () => {
		expect(render(eq(isNotNull(sql`"a"`), isNotNull(sql`"b"`)))).toBe(
			'("a" is not null) = ("b" is not null)',
		);
		expect(render(eq(isNull(sql`"a"`), isNull(sql`"b"`)))).toBe(
			'("a" is null) = ("b" is null)',
		);
	});
});
