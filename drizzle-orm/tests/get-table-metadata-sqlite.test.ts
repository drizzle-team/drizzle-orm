import { describe, test } from 'vitest';
import { getTableMetadata } from '~/metadata.ts';
import { blob, integer, real, sqliteTable, text } from '~/sqlite-core/index.ts';

describe.concurrent('getTableMetadata (sqlite)', () => {
	test('table shape', ({ expect }) => {
		const t = sqliteTable('rows', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		});
		const meta = getTableMetadata(t);

		expect(meta.name).toBe('rows');
		expect(meta.baseName).toBe('rows');
		expect(meta.schema).toBeNull();
		expect(Object.keys(meta.columns)).toEqual(['id', 'name']);
	});

	test('integer / real / text / blob columnType + dataType', ({ expect }) => {
		const t = sqliteTable('t', {
			n: integer('n'),
			f: real('f'),
			s: text('s'),
			b: blob('b'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['n']!.columnType).toBe('SQLiteInteger');
		expect(cols['n']!.dataType).toBe('number');
		expect(cols['f']!.columnType).toBe('SQLiteReal');
		expect(cols['f']!.dataType).toBe('number');
		expect(cols['s']!.columnType).toBe('SQLiteText');
		expect(cols['s']!.dataType).toBe('string');
		expect(cols['b']!.dataType).toBe('buffer');
	});

	test('sqlite text with length captures length', ({ expect }) => {
		const t = sqliteTable('t', {
			short: text('short', { length: 10 }),
			open: text('open'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['short']!.length).toBe(10);
		expect(cols['open']!.length).toBeUndefined();
	});

	test('sqlite text enum captures enumValues', ({ expect }) => {
		const t = sqliteTable('t', {
			role: text('role', { enum: ['admin', 'user'] }),
		});
		const col = getTableMetadata(t).columns['role']!;

		expect(col.enumValues).toEqual(['admin', 'user']);
	});

	test('notNull and hasDefault propagate', ({ expect }) => {
		const t = sqliteTable('t', {
			a: text('a').notNull(),
			b: text('b').default('x'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['a']!.notNull).toBe(true);
		expect(cols['a']!.hasDefault).toBe(false);
		expect(cols['b']!.notNull).toBe(false);
		expect(cols['b']!.hasDefault).toBe(true);
	});
});
