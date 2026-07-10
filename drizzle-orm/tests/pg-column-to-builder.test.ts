import { describe, expect, test } from 'vitest';
import {
	integer,
	numeric,
	type PgColumn,
	type PgColumnToBuilderOverrides,
	pgEnum,
	pgSchema,
	pgTable,
	timestamp,
	varchar,
} from '~/pg-core';
import { sql } from '~/sql';
import { getTableColumns } from '~/utils';

const mood = pgEnum('mood', ['sad', 'ok', 'happy']);

const source = pgTable('source', {
	// pk + notNull + unique + identity: the maximal combinable set (a column can't hold both a
	// plain `default` and an identity, so the plain default lives on `price`).
	id: integer('id')
		.generatedAlwaysAsIdentity({ name: 'id_seq' })
		.primaryKey()
		.unique('id_uq', { nulls: 'not distinct' }),
	name: varchar('name', { length: 120 }).notNull().unique(),
	price: numeric('price', { precision: 10, scale: 2 }).default('0'),
	mood: mood('mood').notNull(),
	tags: integer('tags').array().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
	token: varchar('token', { length: 64 }).$defaultFn(() => 'tok'),
	updatedAt: timestamp('updated_at').$onUpdateFn(() => new Date(0)),
	doubled: integer('doubled').generatedAlwaysAs(sql`price * 2`),
});

// Clone every source column back into a builder, then materialize through a real table.
const clone = pgTable('clone', {
	id: source.id.toBuilder(),
	name: source.name.toBuilder(),
	price: source.price.toBuilder(),
	mood: source.mood.toBuilder(),
	tags: source.tags.toBuilder(),
	createdAt: source.createdAt.toBuilder(),
	token: source.token.toBuilder(),
	updatedAt: source.updatedAt.toBuilder(),
	doubled: source.doubled.toBuilder(),
});

const src = getTableColumns(source);
const cln = getTableColumns(clone);

const configProps = [
	'primary',
	'notNull',
	'hasDefault',
	'default',
	'defaultFn',
	'onUpdateFn',
	'isUnique',
	'uniqueName',
	'uniqueType',
	'generated',
	'generatedIdentity',
	'dataType',
	'columnType',
] as const;

describe('PgColumn.toBuilder', () => {
	test('bare toBuilder() round-trips every value/constraint clause verbatim', () => {
		for (const key of Object.keys(src) as (keyof typeof src)[]) {
			for (const prop of configProps) {
				expect((cln[key] as any)[prop]).toEqual((src[key] as any)[prop]);
			}
			expect(cln[key].getSQLType()).toBe(src[key].getSQLType());
		}
	});

	test('round-trips the maximal column (pk + notNull + unique + identity)', () => {
		expect(cln.id.primary).toBe(true);
		expect(cln.id.notNull).toBe(true);
		expect(cln.id.isUnique).toBe(true);
		expect(cln.id.uniqueName).toBe('id_uq');
		expect(cln.id.uniqueType).toBe('not distinct');
		expect(cln.id.hasDefault).toBe(true);
		expect(cln.id.generatedIdentity).toEqual({
			type: 'always',
			sequenceName: 'id_seq',
			sequenceOptions: {},
		});
	});

	test('preserves length / precision / withTimezone', () => {
		expect(cln.name.getSQLType()).toBe('varchar(120)');
		expect(cln.price.getSQLType()).toBe('numeric(10, 2)');
		expect(cln.createdAt.getSQLType()).toBe('timestamp (3) with time zone');
	});

	test('reuses the same enum instance', () => {
		expect((cln.mood as any).enum).toBe((src.mood as any).enum);
		expect(cln.mood.enumValues).toEqual(['sad', 'ok', 'happy']);
	});

	test('preserves array dimensions and array codec', () => {
		expect(cln.tags.dimensions).toBe(1);
		// postBuild must have wrapped the codec so an array round-trips element-wise.
		expect(cln.tags.mapToDriverValue([1, 2, 3])).toEqual(src.tags.mapToDriverValue([1, 2, 3]));
	});

	test('round-trips a driver value identically to the source column', () => {
		const d = new Date('2024-01-02T03:04:05.678Z');
		expect(cln.createdAt.mapToDriverValue(d)).toBe(src.createdAt.mapToDriverValue(d));
	});

	test('preserves $defaultFn / $onUpdateFn as callable functions', () => {
		expect(cln.token.defaultFn).toBe(src.token.defaultFn);
		expect(cln.token.defaultFn!()).toBe('tok');
		expect(cln.updatedAt.onUpdateFn).toBe(src.updatedAt.onUpdateFn);
		expect(cln.updatedAt.onUpdateFn!()).toEqual(new Date(0));
	});

	test('preserves the generated clause', () => {
		expect(cln.doubled.generated).toBe(src.doubled.generated);
		// pg's generatedAlwaysAs does not set hasDefault (generated columns are excluded from inserts).
		expect(cln.doubled.hasDefault).toBe(src.doubled.hasDefault);
	});

	describe('overrides replace and clear each clause', () => {
		const build = (col: PgColumn, overrides: PgColumnToBuilderOverrides) =>
			getTableColumns(pgTable('t', { c: col.toBuilder(overrides) })).c;

		test('primaryKey', () => {
			expect(build(source.id, { primaryKey: false }).primary).toBe(false);
			expect(build(source.price, { primaryKey: true }).primary).toBe(true);
		});

		test('notNull', () => {
			expect(build(source.name, { notNull: false }).notNull).toBe(false);
			expect(build(source.price, { notNull: true }).notNull).toBe(true);
		});

		test('default', () => {
			expect(build(source.price, { default: '5' }).default).toBe('5');
			const cleared = build(source.price, { default: undefined });
			expect(cleared.default).toBeUndefined();
			expect(cleared.hasDefault).toBe(false);
		});

		test('defaultFn', () => {
			const fn = () => 'other';
			expect(build(source.token, { defaultFn: fn }).defaultFn).toBe(fn);
			const cleared = build(source.token, { defaultFn: undefined });
			expect(cleared.defaultFn).toBeUndefined();
			expect(cleared.hasDefault).toBe(false);
		});

		test('onUpdateFn', () => {
			const fn = () => new Date(1);
			expect(build(source.updatedAt, { onUpdateFn: fn }).onUpdateFn).toBe(fn);
			const cleared = build(source.updatedAt, { onUpdateFn: undefined });
			expect(cleared.onUpdateFn).toBeUndefined();
			expect(cleared.hasDefault).toBe(false);
		});

		test('unique', () => {
			const cleared = build(source.name, { unique: false });
			expect(cleared.isUnique).toBe(false);
			expect(cleared.uniqueName).toBeUndefined();
			expect(cleared.uniqueType).toBeUndefined();

			const plain = build(source.price, { unique: true });
			expect(plain.isUnique).toBe(true);
			expect(plain.uniqueName).toBeUndefined();

			const configured = build(source.price, { unique: { name: 'p_uq', nulls: 'not distinct' } });
			expect(configured.isUnique).toBe(true);
			expect(configured.uniqueName).toBe('p_uq');
			expect(configured.uniqueType).toBe('not distinct');
		});

		test('generated', () => {
			const cleared = build(source.doubled, { generated: undefined });
			expect(cleared.generated).toBeUndefined();
			expect(cleared.hasDefault).toBe(false);
		});

		test('generatedIdentity', () => {
			const cleared = build(source.id, { generatedIdentity: undefined });
			expect(cleared.generatedIdentity).toBeUndefined();
			expect(cleared.hasDefault).toBe(false);
		});

		test('a full clear reproduces a bare, constraint-free column', () => {
			const bare = build(source.id, {
				primaryKey: false,
				notNull: false,
				default: undefined,
				defaultFn: undefined,
				onUpdateFn: undefined,
				unique: false,
				generated: undefined,
				generatedIdentity: undefined,
			});
			expect(bare.primary).toBe(false);
			expect(bare.notNull).toBe(false);
			expect(bare.isUnique).toBe(false);
			expect(bare.hasDefault).toBe(false);
			expect(bare.generatedIdentity).toBeUndefined();
			// type is still preserved through the clear.
			expect(bare.getSQLType()).toBe('integer');
		});
	});

	test('name override renames the cloned column', () => {
		const renamed = pgTable('renamed', {
			old: source.name.toBuilder({ name: '$old_name' }),
		});
		expect(getTableColumns(renamed).old.name).toBe('$old_name');
	});

	test('works through pgSchema().table()', () => {
		const schema = pgSchema('tenant');
		const derived = schema.table('derived', { price: source.price.toBuilder() });
		expect(getTableColumns(derived).price.getSQLType()).toBe('numeric(10, 2)');
	});
});
