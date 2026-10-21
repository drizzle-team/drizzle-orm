import { describe, expect, test } from 'vitest';
import { drizzle } from '~/durable-sqlite';
import { sql } from '~/sql';
import { integer, sqliteTable, text } from '~/sqlite-core';

const items = sqliteTable('items', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

function createMockStorage(rows: { id: number; name: string }[]) {
	let cursorClosed = false;
	const storage = {
		sql: {
			exec: () => {
				cursorClosed = false;
				let objIdx = 0;
				let rawIdx = 0;
				return {
					next() {
						if (objIdx < rows.length) {
							return { done: false as const, value: rows[objIdx++]! };
						}
						cursorClosed = true;
						return { done: true as const, value: undefined };
					},
					raw() {
						return {
							next() {
								if (rawIdx < rows.length) {
									const r = rows[rawIdx++]!;
									return { done: false as const, value: [r.id, r.name] };
								}
								cursorClosed = true;
								return { done: true as const, value: undefined };
							},
							[Symbol.iterator]() {
								return this;
							},
						};
					},
					[Symbol.iterator]() {
						return this;
					},
				};
			},
		},
	};

	return {
		storage: storage as unknown as DurableObjectStorage,
		isCursorClosed: () => cursorClosed,
	};
}

describe('durable-sqlite .get() cursor exhaustion', () => {
	test('steps raw cursor to completion when multiple rows match', () => {
		const { storage, isCursorClosed } = createMockStorage([
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
			{ id: 3, name: 'c' },
		]);
		const db = drizzle(storage);

		const row = db.select().from(items).get();
		expect(row).toStrictEqual({ id: 1, name: 'a' });
		expect(isCursorClosed()).toBe(true);
	});

	test('steps object cursor to completion when multiple rows match', () => {
		const { storage, isCursorClosed } = createMockStorage([
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
		]);
		const db = drizzle(storage);

		const row = db.get<{ id: number; name: string }>(sql`select id, name from items`);
		expect(row).toStrictEqual({ id: 1, name: 'a' });
		expect(isCursorClosed()).toBe(true);
	});

	test('returns undefined and closes cursor when no rows match', () => {
		const { storage, isCursorClosed } = createMockStorage([]);
		const db = drizzle(storage);

		const row = db.select().from(items).get();
		expect(row).toBeUndefined();
		expect(isCursorClosed()).toBe(true);
	});
});
