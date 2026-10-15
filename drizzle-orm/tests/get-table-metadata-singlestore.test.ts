import { describe, test } from 'vitest';
import { getTableMetadata } from '~/metadata.ts';
import { int, singlestoreEnum, singlestoreTable, text, tinyint, varchar } from '~/singlestore-core/index.ts';

describe.concurrent('getTableMetadata (singlestore)', () => {
	test('table shape', ({ expect }) => {
		const t = singlestoreTable('rows', {
			id: int('id').primaryKey().autoincrement(),
			name: varchar('name', { length: 100 }).notNull(),
		});
		const meta = getTableMetadata(t);

		expect(meta.name).toBe('rows');
		expect(meta.baseName).toBe('rows');
		expect(meta.schema).toBeNull();
		expect(Object.keys(meta.columns)).toEqual(['id', 'name']);
	});

	test('int / tinyint columnType', ({ expect }) => {
		const t = singlestoreTable('t', {
			tiny: tinyint('tiny'),
			normal: int('normal'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['tiny']!.columnType).toBe('SingleStoreTinyInt');
		expect(cols['normal']!.columnType).toBe('SingleStoreInt');
	});

	test('varchar captures length', ({ expect }) => {
		const t = singlestoreTable('t', {
			code: varchar('code', { length: 25 }),
		});
		const col = getTableMetadata(t).columns['code']!;

		expect(col.columnType).toBe('SingleStoreVarChar');
		expect(col.length).toBe(25);
	});

	test('text captures textType', ({ expect }) => {
		const t = singlestoreTable('t', { a: text('a') });
		const col = getTableMetadata(t).columns['a']!;

		expect(col.columnType).toBe('SingleStoreText');
		expect(col.textType).toBe('text');
	});

	test('singlestoreEnum captures enumValues', ({ expect }) => {
		const t = singlestoreTable('t', {
			color: singlestoreEnum('color', ['red', 'green']),
		});
		const col = getTableMetadata(t).columns['color']!;

		expect(col.enumValues).toEqual(['red', 'green']);
	});
});
