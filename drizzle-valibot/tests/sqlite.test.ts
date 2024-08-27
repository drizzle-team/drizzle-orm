import { blob, integer, numeric, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
	bigint as valibigint,
	boolean,
	date as valiDate,
	type InferOutput,
	minValue,
	nullable,
	number,
	object,
	optional,
	parse,
	picklist,
	pipe,
	string,
} from 'valibot';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema, jsonSchema } from '../src';
import { expectSchemaShape } from './utils.ts';

const blobJsonSchema = object({
	foo: string(),
});

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	blobJson: blob('blob', { mode: 'json' })
		.$type<InferOutput<typeof blobJsonSchema>>()
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
	role: 'admin' as const,
};

test('users insert valid user', () => {
	const schema = createInsertSchema(users);
	//
	expect(parse(schema, testUser)).toStrictEqual(testUser);
});

test('users insert invalid text length', () => {
	const schema = createInsertSchema(users);
	expect(() => parse(schema, { ...testUser, text: 'a'.repeat(256) })).toThrow(
		undefined,
	);
});

test('users insert schema', () => {
	const actual = createInsertSchema(users, {
		id: () => pipe(number(), minValue(0)),
		blobJson: blobJsonSchema,
		role: picklist(['admin', 'user', 'manager']),
	});

	(() => {
		{
			createInsertSchema(users, {
				// @ts-expect-error (missing property)
				foobar: number(),
			});
		}

		{
			createInsertSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = object({
		id: optional(pipe(number(), minValue(0))),
		blobJson: blobJsonSchema,
		blobBigInt: valibigint(),
		numeric: string(),
		createdAt: valiDate(),
		createdAtMs: valiDate(),
		boolean: boolean(),
		real: number(),
		text: optional(nullable(string())),
		role: optional(picklist(['admin', 'user', 'manager'])),
	});

	expectSchemaShape(expected).from(actual);
});

test('users insert schema w/ defaults', () => {
	const actual = createInsertSchema(users);

	const expected = object({
		id: optional(number()),
		blobJson: jsonSchema,
		blobBigInt: valibigint(),
		numeric: string(),
		createdAt: valiDate(),
		createdAtMs: valiDate(),
		boolean: boolean(),
		real: number(),
		text: optional(nullable(string())),
		role: optional(picklist(['admin', 'user'])),
	});

	expectSchemaShape(expected).from(actual);
});

test('users select schema', () => {
	const actual = createSelectSchema(users, {
		blobJson: jsonSchema,
		role: picklist(['admin', 'user', 'manager']),
	});

	(() => {
		{
			createSelectSchema(users, {
				// @ts-expect-error (missing property)
				foobar: number(),
			});
		}

		{
			createSelectSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = object({
		id: number(),
		blobJson: jsonSchema,
		blobBigInt: valibigint(),
		numeric: string(),
		createdAt: valiDate(),
		createdAtMs: valiDate(),
		boolean: boolean(),
		real: number(),
		text: nullable(string()),
		role: picklist(['admin', 'user', 'manager']),
	});

	expectSchemaShape(expected).from(actual);
});

test('users select schema w/ defaults', () => {
	const actual = createSelectSchema(users);

	const expected = object({
		id: number(),
		blobJson: jsonSchema,
		blobBigInt: valibigint(),
		numeric: string(),
		createdAt: valiDate(),
		createdAtMs: valiDate(),
		boolean: boolean(),
		real: number(),
		text: nullable(string()),
		role: picklist(['admin', 'user']),
	});

	expectSchemaShape(expected).from(actual);
});
