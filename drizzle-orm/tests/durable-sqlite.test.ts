import { describe, expect, it } from 'vitest';
import { drizzle } from '~/durable-sqlite/index.ts';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';

const items = sqliteTable('items', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

function createMockStorage(rows: Record<string, unknown>[]) {
	let drained = false;
	let executedSql = '';
	let executedParams: unknown[] = [];

	const mockCursor = {
		_index: 0,
		next() {
			if (this._index >= rows.length) {
				drained = true;
				return { done: true as const, value: undefined };
			}
			const value = rows[this._index++];
			return { done: false as const, value };
		},
		raw() {
			let rawIndex = 0;
			return {
				next() {
					if (rawIndex >= rows.length) {
						drained = true;
						return { done: true as const, value: undefined };
					}
					const row = rows[rawIndex++];
					return { done: false as const, value: row ? Object.values(row) : [] };
				},
				toArray() {
					drained = true;
					return rows.map((r) => Object.values(r));
				},
			};
		},
		toArray() {
			drained = true;
			return rows;
		},
	};

	const client = {
		sql: {
			exec(sql: string, ...params: unknown[]) {
				executedSql = sql;
				executedParams = params;
				drained = false;
				mockCursor._index = 0;
				return mockCursor;
			},
		},
		transactionSync<T>(cb: () => T): T {
			return cb();
		},
		get isDrained() {
			return drained;
		},
		get executedSql() {
			return executedSql;
		},
		get executedParams() {
			return executedParams;
		},
	};

	return client;
}

describe('durable-sqlite cursor drain on get()', () => {
	it('drains cursor completely when query matches multiple rows', () => {
		const mockStorage = createMockStorage([
			{ id: 1, name: 'first' },
			{ id: 2, name: 'second' },
			{ id: 3, name: 'third' },
		]);

		const db = drizzle(mockStorage as any);
		const result = db.select().from(items).get();

		expect(result).toEqual({ id: 1, name: 'first' });
		expect(mockStorage.isDrained).toBe(true);
	});

	it('handles single row match and finishes cursor', () => {
		const mockStorage = createMockStorage([
			{ id: 10, name: 'only' },
		]);

		const db = drizzle(mockStorage as any);
		const result = db.select().from(items).get();

		expect(result).toEqual({ id: 10, name: 'only' });
		expect(mockStorage.isDrained).toBe(true);
	});

	it('handles zero rows without error and leaves cursor drained', () => {
		const mockStorage = createMockStorage([]);

		const db = drizzle(mockStorage as any);
		const result = db.select().from(items).get();

		expect(result).toBeUndefined();
		expect(mockStorage.isDrained).toBe(true);
	});
});
