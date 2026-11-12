import { describe, test } from 'vitest';
import { getTableMetadata } from '~/metadata.ts';
import {
	bigint,
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgSchema,
	pgTable,
	serial,
	text,
	timestamp,
	uuid,
	varchar,
} from '~/pg-core/index.ts';
import { vector } from '~/pg-core/columns/vector_extension/vector.ts';

describe.concurrent('getTableMetadata (pg)', () => {
	test('table shape: name, baseName, schema, columns map', ({ expect }) => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});
		const meta = getTableMetadata(users);

		expect(meta.name).toBe('users');
		expect(meta.baseName).toBe('users');
		expect(meta.schema).toBeNull();
		expect(Object.keys(meta.columns)).toEqual(['id', 'name']);
	});

	test('schema-qualified table captures schema', ({ expect }) => {
		const app = pgSchema('app');
		const t = app.table('widgets', { id: serial('id').primaryKey() });
		const meta = getTableMetadata(t);

		expect(meta.name).toBe('widgets');
		expect(meta.schema).toBe('app');
	});

	test('serial column: dataType/columnType/primary/notNull/hasDefault', ({ expect }) => {
		const t = pgTable('t', { id: serial('id').primaryKey() });
		const id = getTableMetadata(t).columns['id']!;

		expect(id.name).toBe('id');
		expect(id.dataType).toBe('number');
		expect(id.columnType).toBe('PgSerial');
		expect(id.primary).toBe(true);
		expect(id.notNull).toBe(true);
		expect(id.hasDefault).toBe(true);
		expect(id.sqlType).toBe('serial');
	});

	test('notNull / hasDefault flags across text variants', ({ expect }) => {
		const t = pgTable('t', {
			a: text('a').notNull(),
			b: text('b'),
			c: text('c').default('x'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['a']!.notNull).toBe(true);
		expect(cols['a']!.hasDefault).toBe(false);
		expect(cols['b']!.notNull).toBe(false);
		expect(cols['b']!.hasDefault).toBe(false);
		expect(cols['c']!.notNull).toBe(false);
		expect(cols['c']!.hasDefault).toBe(true);
	});

	test('uuid column', ({ expect }) => {
		const t = pgTable('t', { id: uuid('id').notNull() });
		const id = getTableMetadata(t).columns['id']!;

		expect(id.dataType).toBe('string');
		expect(id.columnType).toBe('PgUUID');
		expect(id.sqlType).toBe('uuid');
	});

	test('varchar with length captures length; bare text omits length', ({ expect }) => {
		const t = pgTable('t', {
			code: varchar('code', { length: 10 }),
			body: text('body'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['code']!.length).toBe(10);
		expect(cols['body']!.length).toBeUndefined();
	});

	test('jsonb / boolean / timestamp / integer / bigint capture dataType', ({ expect }) => {
		const t = pgTable('t', {
			payload: jsonb('payload'),
			active: boolean('active').default(false),
			createdAt: timestamp('created_at').defaultNow(),
			count: integer('count'),
			big: bigint('big', { mode: 'number' }),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['payload']!.dataType).toBe('json');
		expect(cols['active']!.dataType).toBe('boolean');
		expect(cols['active']!.hasDefault).toBe(true);
		expect(cols['createdAt']!.dataType).toBe('date');
		expect(cols['createdAt']!.hasDefault).toBe(true);
		expect(cols['count']!.dataType).toBe('number');
		expect(cols['count']!.columnType).toBe('PgInteger');
		expect(cols['big']!.columnType).toBe('PgBigInt53');
	});

	test('pgEnum column captures enumValues; non-enum has null enumValues', ({ expect }) => {
		const role = pgEnum('role', ['admin', 'user', 'guest']);
		const t = pgTable('t', {
			role: role('role').notNull(),
			name: text('name'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['role']!.enumValues).toEqual(['admin', 'user', 'guest']);
		expect(cols['role']!.dataType).toBe('string');
		expect(cols['name']!.enumValues).toBeNull();
	});

	test('pg array captures baseColumn recursively; size present when set', ({ expect }) => {
		const t = pgTable('t', {
			tags: text('tags').array(),
			fixed: integer('fixed').array(3),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['tags']!.dataType).toBe('array');
		expect(cols['tags']!.columnType).toBe('PgArray');
		expect(cols['tags']!.baseColumn).toBeDefined();
		expect(cols['tags']!.baseColumn!.columnType).toBe('PgText');
		expect(cols['tags']!.size).toBeUndefined();

		expect(cols['fixed']!.baseColumn!.columnType).toBe('PgInteger');
		expect(cols['fixed']!.size).toBe(3);
	});

	test('pgvector captures dimensions', ({ expect }) => {
		const t = pgTable('t', {
			embedding: vector('embedding', { dimensions: 1536 }),
		});
		const col = getTableMetadata(t).columns['embedding']!;

		expect(col.columnType).toBe('PgVector');
		expect(col.dimensions).toBe(1536);
	});

	test('isUnique is captured', ({ expect }) => {
		const t = pgTable('t', {
			email: text('email').unique(),
			name: text('name'),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['email']!.isUnique).toBe(true);
		expect(cols['name']!.isUnique).toBe(false);
	});

	test('generatedAlwaysAsIdentity / generatedByDefaultAsIdentity captured', ({ expect }) => {
		const t = pgTable('t', {
			a: integer('a').generatedAlwaysAsIdentity(),
			b: integer('b').generatedByDefaultAsIdentity(),
		});
		const cols = getTableMetadata(t).columns;

		expect(cols['a']!.generatedIdentity).toBe('always');
		expect(cols['b']!.generatedIdentity).toBe('byDefault');
	});
});
