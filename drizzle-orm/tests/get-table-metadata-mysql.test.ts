import { describe, test } from 'vitest';
import { getTableMetadata } from '~/metadata.ts';
import {
	bigint,
	boolean,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	tinyint,
	varchar,
} from '~/mysql-core/index.ts';

describe.concurrent('getTableMetadata (mysql)', () => {
	test('table shape', ({ expect }) => {
		const t = mysqlTable('items', {
			id: int('id').primaryKey().autoincrement(),
			name: varchar('name', { length: 100 }).notNull(),
		});
		const meta = getTableMetadata(t);

		expect(meta.name).toBe('items');
		expect(meta.baseName).toBe('items');
		expect(meta.schema).toBeNull();
		expect(Object.keys(meta.columns)).toEqual(['id', 'name']);
	});

	test('int columnType + dataType', ({ expect }) => {
		const t = mysqlTable('t', {
			tiny: tinyint('tiny'),
			normal: int('normal'),
			big: bigint('big', { mode: 'number' }),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['tiny']!.columnType).toBe('MySqlTinyInt');
		expect(cols['tiny']!.dataType).toBe('number');
		expect(cols['normal']!.columnType).toBe('MySqlInt');
		expect(cols['big']!.columnType).toBe('MySqlBigInt53');
	});

	test('unsigned int reflected in sqlType', ({ expect }) => {
		const t = mysqlTable('t', {
			a: int('a', { unsigned: true }),
			b: int('b'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['a']!.sqlType.includes('unsigned')).toBe(true);
		expect(cols['b']!.sqlType.includes('unsigned')).toBe(false);
	});

	test('varchar captures length', ({ expect }) => {
		const t = mysqlTable('t', {
			code: varchar('code', { length: 20 }),
		});
		const col = getTableMetadata(t).columns['code']!;

		expect(col.columnType).toBe('MySqlVarChar');
		expect(col.length).toBe(20);
	});

	test('text variants capture textType', ({ expect }) => {
		const t = mysqlTable('t', {
			a: text('a'),
		});
		const col = getTableMetadata(t).columns['a']!;

		expect(col.columnType).toBe('MySqlText');
		expect(col.dataType).toBe('string');
		expect(col.textType).toBe('text');
	});

	test('mysqlEnum captures enumValues', ({ expect }) => {
		const t = mysqlTable('t', {
			color: mysqlEnum('color', ['red', 'green', 'blue']),
		});
		const col = getTableMetadata(t).columns['color']!;

		expect(col.enumValues).toEqual(['red', 'green', 'blue']);
		expect(col.dataType).toBe('string');
	});

	test('boolean + timestamp', ({ expect }) => {
		const t = mysqlTable('t', {
			active: boolean('active').default(true),
			createdAt: timestamp('created_at').defaultNow(),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['active']!.dataType).toBe('boolean');
		expect(cols['active']!.hasDefault).toBe(true);
		expect(cols['createdAt']!.dataType).toBe('date');
		expect(cols['createdAt']!.hasDefault).toBe(true);
	});
});
