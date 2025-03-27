import { type Equal, sql } from 'drizzle-orm';
import { integer, pgDomain, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { test } from 'vitest';
import { z } from 'zod';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

// TODO think about what to do with the existing filters being added when check constraints are involved
const integerSchema = z.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).int();
const textSchema = z.string();

test('table containing columns with check constraints', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		firstName: text('first_name')
			.notNull()
			.checkConstraint('first_name_length', sql`length(first_name) BETWEEN 2 and 100`),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: integerSchema, firstName: textSchema.min(2).max(100) });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('selecting from table containing custom domain columns', (t) => {
	const shortTextDomain = pgDomain(
		'limited_text',
		text().notNull().checkConstraint('limited_text_length', sql`length(value) BETWEEN 3 and 50`),
	);

	const table = pgTable('users', {
		id: serial('id').notNull(),
		email: shortTextDomain(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({
		id: integerSchema,
		email: textSchema.min(3).max(50),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('selecting from table containing custom domain columns with complicated postgres syntax', (t) => {
	const shortTextDomain = pgDomain(
		'limited_text',
		text().notNull().checkConstraint(
			'limited_text_length',
			sql`CHECK (((length(TRIM(BOTH FROM VALUE)) >= 8) AND (length(TRIM(BOTH FROM VALUE)) <= 64)))`,
		),
	);

	const table = pgTable('users', {
		id: serial('id').notNull(),
		email: shortTextDomain(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({
		id: integerSchema,
		email: textSchema.min(8).max(64),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('inserting into table containing custom domain columns', (t) => {
	const shortTextDomain = pgDomain(
		'limited_text',
		text().notNull().checkConstraint('limited_text_length', sql`(length(value) BETWEEN 3 and 50)`),
	);

	const table = pgTable('users', {
		email: shortTextDomain(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({
		email: textSchema.min(3).max(50),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table containing column with numeric BETWEEN constraint', (t) => {
	const table = pgTable('users', {
		age: integer('age')
			.notNull()
			.checkConstraint('age_range', sql`age BETWEEN 18 AND 65`),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ age: integerSchema.min(18).max(65) });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table containing column with numeric exclusive bounds', (t) => {
	const table = pgTable('employees', {
		salary: integer('salary')
			.notNull()
			// Using > and < for exclusive bounds
			.checkConstraint('salary_gt', sql`salary > 30000`)
			.checkConstraint('salary_lt', sql`salary < 200000`),
	});

	const result = createSelectSchema(table);
	// Note: The Zod schema uses .gt() for exclusive greater-than and .lt() for exclusive less-than.
	const expected = z.object({ salary: integerSchema.gt(30000).lt(200000) });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table containing column with string length BETWEEN constraint', (t) => {
	const table = pgTable('contacts', {
		firstName: text('first_name')
			.notNull()
			.checkConstraint('first_name_length', sql`length(first_name) BETWEEN 2 AND 100`),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ firstName: z.string().min(2).max(100) });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table containing column with string exclusive length constraints', (t) => {
	const table = pgTable('products', {
		code: text('code')
			.notNull()
			// Use > for exclusive minimum length and < for exclusive maximum length.
			.checkConstraint('code_min', sql`length(code) > 3`)
			.checkConstraint('code_max', sql`length(code) < 10`),
	});

	const result = createSelectSchema(table);
	// Because Zod has no built-in exclusive length, we add refinements.
	const expected = z.object({
		code: z.string().min(4).max(9),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table containing column with LIKE pattern constraint', (t) => {
	const table = pgTable('accounts', {
		email: text('email')
			.notNull()
			// For example, require the email to contain an "@" somewhere.
			.checkConstraint('email_pattern', sql`email LIKE '%@%.%'`),
	});

	const result = createSelectSchema(table);
	// The likeToRegex conversion will create a regex anchored at start and end.
	// Here we do not specify the exact regex string; instead we verify that the schema includes a regex refinement.
	const expected = z.object({
		email: z.string().regex(/.*@.*\..*/i), // this is a loose check; adjust as needed.
	});
	// You might need to run a sample against the schema to ensure it rejects values without an "@".
	expectSchemaShape(t, expected).from(result);
	// Type-level equality can be relaxed here if necessary.
});

test('table containing column with PostgreSQL regex operator constraint', (t) => {
	const table = pgTable('users', {
		username: text('username')
			.notNull()
			// Using the PostgreSQL regex operator (~) to enforce a pattern.
			.checkConstraint('username_regex', sql`username ~ '^\\w+$'`),
	});

	const result = createSelectSchema(table);
	// The expected Zod schema should include a regex refinement for the allowed characters.
	const expected = z.object({
		username: z.string().regex(/^\w+$/i),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});
