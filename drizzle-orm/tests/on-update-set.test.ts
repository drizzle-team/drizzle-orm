import { describe, expect, it } from 'vitest';
import { PgDialect, pgTable, text, uuid } from '~/pg-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { mapUpdateSet } from '~/utils.ts';

describe('$onUpdate lazy evaluation (#5780)', () => {
	it('does not invoke $onUpdate when the column value is explicitly provided in set', () => {
		const table = pgTable('example', {
			id: uuid('id').primaryKey(),
			name: text('name').notNull(),
			updatedById: uuid('updated_by_id')
				.$onUpdate(() => {
					throw new Error('$onUpdate must not run when the column is explicitly set');
				})
				.notNull(),
		});

		const dialect = new PgDialect();

		expect(() => dialect.buildUpdateSet(table, mapUpdateSet(table, { name: 'foo', updatedById: 'some-uuid' }))).not
			.toThrow();
	});

	it('still invokes $onUpdate when the column is absent from set', () => {
		let called = false;
		const table = pgTable('example', {
			id: uuid('id').primaryKey(),
			name: text('name').notNull(),
			touched: text('touched').$onUpdate(() => {
				called = true;
				return sql`now()`;
			}),
		});

		new PgDialect().buildUpdateSet(table, mapUpdateSet(table, { name: 'foo' }));

		expect(called).toBe(true);
	});
});
