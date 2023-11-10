import { type Static, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import test from 'ava';
import { blob, integer, numeric, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, jsonSchema, Nullable } from '../src';
import { expectSchemaShape } from './utils';

const blobJsonSchema = Type.Object({
	foo: Type.String(),
});

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	blobJson: blob('blob', { mode: 'json' })
		.$type<Static<typeof blobJsonSchema>>()
		.notNull(),
	blobBigInt: blob('blob', { mode: 'bigint' }).notNull(),
	numeric: numeric('numeric').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }).notNull(),
	boolean: integer('boolean', { mode: 'boolean' }).notNull(),
	real: real('real').notNull(),
	text: text('text', { length: 255 }),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
});

const testUser = {
	id: 1,
	blobJson: { foo: 'bar' },
	blobBigInt: BigInt(123),
	numeric: '123.45',
	createdAt: new Date(),
	createdAtMs: new Date(),
	boolean: true,
	real: 123.45,
	text: 'foobar',
	role: 'admin',
};

test('users insert valid user', (t) => {
	const schema = createInsertSchema(users);
	//
	t.is(Value.Check(schema, testUser), true);
});

test('users insert invalid text length', (t) => {
	const schema = createInsertSchema(users);

	t.is(Value.Check(schema, { ...testUser, text: 'a'.repeat(256) }), false);
});

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: () => Type.Number({ minimum: 0 }),
		blobJson: blobJsonSchema,
		role: Type.Union([
			Type.Literal('admin'),
			Type.Literal('user'),
			Type.Literal('manager'),
		]),
	});

	(() => {
		{
			createInsertSchema(users, {
				// @ts-expect-error (missing property)
				foobar: Type.Number(),
			});
		}

		{
			createInsertSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = Type.Object({
		id: Type.Optional(Type.Number({ minimum: 0 })),
		blobJson: blobJsonSchema,
		blobBigInt: Type.BigInt(),
		numeric: Type.String(),
		createdAt: Type.Date(),
		createdAtMs: Type.Date(),
		boolean: Type.Boolean(),
		real: Type.Number(),
		text: Type.Optional(Nullable(Type.String())),
		role: Type.Optional(
			Type.Union([
				Type.Literal('admin'),
				Type.Literal('user'),
				Type.Literal('manager'),
			]),
		),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = Type.Object({
		id: Type.Optional(Type.Number()),
		blobJson: jsonSchema,
		blobBigInt: Type.BigInt(),
		numeric: Type.String(),
		createdAt: Type.Date(),
		createdAtMs: Type.Date(),
		boolean: Type.Boolean(),
		real: Type.Number(),
		text: Type.Optional(Nullable(Type.String())),
		role: Type.Optional(
			Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		blobJson: jsonSchema,
		role: Type.Union([
			Type.Literal('admin'),
			Type.Literal('user'),
			Type.Literal('manager'),
		]),
	});

	(() => {
		{
			createSelectSchema(users, {
				// @ts-expect-error (missing property)
				foobar: Type.Number(),
			});
		}

		{
			createSelectSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = Type.Strict(
		Type.Object({
			id: Type.Number(),
			blobJson: jsonSchema,
			blobBigInt: Type.BigInt(),
			numeric: Type.String(),
			createdAt: Type.Date(),
			createdAtMs: Type.Date(),
			boolean: Type.Boolean(),
			real: Type.Number(),
			text: Nullable(Type.String()),
			role: Type.Union([
				Type.Literal('admin'),
				Type.Literal('user'),
				Type.Literal('manager'),
			]),
		}),
	);

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = Type.Object({
		id: Type.Number(),
		blobJson: jsonSchema,
		blobBigInt: Type.BigInt(),
		numeric: Type.String(),
		createdAt: Type.Date(),
		createdAtMs: Type.Date(),
		boolean: Type.Boolean(),
		real: Type.Number(),
		text: Nullable(Type.String()),
		role: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
	});

	expectSchemaShape(t, expected).from(actual);
});
