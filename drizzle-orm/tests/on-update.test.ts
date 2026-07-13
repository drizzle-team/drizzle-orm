import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { pgTable, text, uuid } from '~/pg-core';
import { drizzle } from '~/postgres-js';
import { eq } from '~/sql';

// Regression for drizzle-team/drizzle-orm#5780. In 0.45.x `buildUpdateSet`
// invoked every column's `$onUpdate` callback eagerly, even when the column
// value was explicitly supplied in `set`. Callbacks with side effects
// (throwing, logging, reading external state) then ran on every UPDATE.
//
// These tests assert the 0.44.6 contract: `$onUpdate` is only invoked when
// the column is absent from `set`. The pg-core dialect is exercised here;
// the identical pattern lives in mysql-core, sqlite-core, singlestore-core,
// and gel-core, and is fixed alongside pg-core in the same patch.

const db = drizzle(postgres(''));

describe('$onUpdate evaluation', () => {
	it('does not invoke the callback when the column is explicitly provided in set', () => {
		const table = pgTable('example', {
			id: uuid('id').primaryKey(),
			name: text('name').notNull(),
			updatedById: uuid('updated_by_id')
				.$onUpdate(() => {
					throw new Error('should not be called when column is explicitly set');
				})
				.notNull(),
		});

		const query = db
			.update(table)
			.set({ name: 'foo', updatedById: '00000000-0000-0000-0000-000000000000' })
			.where(eq(table.id, '00000000-0000-0000-0000-000000000000'));

		expect(() => query.toSQL()).not.toThrow();
		expect(query.toSQL()).toEqual({
			sql:
				'update "example" set "name" = $1, "updated_by_id" = $2 where "example"."id" = $3',
			params: [
				'foo',
				'00000000-0000-0000-0000-000000000000',
				'00000000-0000-0000-0000-000000000000',
			],
		});
	});

	it('invokes the callback exactly once when the column is absent from set', () => {
		let invocations = 0;
		const table = pgTable('example', {
			id: uuid('id').primaryKey(),
			name: text('name').notNull(),
			updatedById: uuid('updated_by_id')
				.$onUpdate(() => {
					invocations++;
					return '11111111-1111-1111-1111-111111111111';
				})
				.notNull(),
		});

		const query = db
			.update(table)
			.set({ name: 'foo' })
			.where(eq(table.id, '00000000-0000-0000-0000-000000000000'));

		const compiled = query.toSQL();
		expect(invocations).toBe(1);
		expect(compiled.params).toContain('11111111-1111-1111-1111-111111111111');
	});
});
