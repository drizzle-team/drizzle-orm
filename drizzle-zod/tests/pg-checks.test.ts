import { sql } from 'drizzle-orm';
import { bigint, integer, pgDomain, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { z } from 'zod/v4';
import { createInsertSchema, createSelectSchema } from '../src';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

test('table containing columns with check constraints', () => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		firstName: text('first_name').notNull().checkConstraint(
			'first_name_length',
			sql`length(first_name) BETWEEN 2 and 100`,
		),
	});
	const { firstName } = createSelectSchema(table).shape;
	expect([
		accepts(firstName, 'a'),
		accepts(firstName, 'ab'),
		accepts(firstName, 'a'.repeat(100)),
		accepts(firstName, 'a'.repeat(101)),
	])
		.toEqual([false, true, true, false]);
});

test('selecting from table containing custom domain columns', () => {
	const shortTextDomain = pgDomain(
		'limited_text',
		text().notNull().checkConstraint('limited_text_length', sql`length(value) BETWEEN 3 and 50`),
	);
	const table = pgTable('users', { id: serial('id').notNull(), email: shortTextDomain() });
	const { email } = createSelectSchema(table).shape;
	expect([accepts(email, 'ab'), accepts(email, 'abc'), accepts(email, 'a'.repeat(51)), accepts(email, null)])
		.toEqual([false, true, false, false]);
});

test('selecting from table containing custom domain columns with complicated postgres syntax', () => {
	const shortTextDomain = pgDomain(
		'limited_text',
		text().notNull().checkConstraint(
			'limited_text_length',
			sql`CHECK (((length(TRIM(BOTH FROM VALUE)) >= 8) AND (length(TRIM(BOTH FROM VALUE)) <= 64)))`,
		),
	);
	const table = pgTable('users', { id: serial('id').notNull(), email: shortTextDomain() });
	const { email } = createSelectSchema(table).shape;
	// both bounds apply to the trimmed value, exactly like postgres
	expect([
		accepts(email, '1234567'),
		accepts(email, '  12345678  '),
		accepts(email, 'a'.repeat(65)),
		accepts(email, ` ${'a'.repeat(64)} `),
	])
		.toEqual([false, true, false, true]);
});

test('inserting into table containing custom domain columns', () => {
	const shortTextDomain = pgDomain(
		'limited_text',
		text().notNull().checkConstraint('limited_text_length', sql`(length(value) BETWEEN 3 and 50)`),
	);
	const schema = createInsertSchema(pgTable('users', { email: shortTextDomain() }));
	expect([
		schema.safeParse({ email: 'ab' }).success,
		schema.safeParse({ email: 'abc' }).success,
		schema.safeParse({}).success,
	])
		.toEqual([false, true, false]);
});

test('table containing column with numeric BETWEEN constraint', () => {
	const table = pgTable('users', {
		age: integer('age').notNull().checkConstraint('age_range', sql`age BETWEEN 18 AND 65`),
	});
	const { age } = createSelectSchema(table).shape;
	expect([17, 18, 65, 66].map((v) => accepts(age, v))).toEqual([false, true, true, false]);
});

test('table containing column with numeric exclusive bounds', () => {
	const table = pgTable('employees', {
		salary: integer('salary')
			.notNull()
			.checkConstraint('salary_gt', sql`salary > 30000`)
			.checkConstraint('salary_lt', sql`salary < 200000`),
	});
	const { salary } = createSelectSchema(table).shape;
	expect([30000, 30001, 199999, 200000].map((v) => accepts(salary, v))).toEqual([false, true, true, false]);
});

test('table containing column with string length BETWEEN constraint', () => {
	const table = pgTable('contacts', {
		firstName: text('first_name').notNull().checkConstraint(
			'first_name_length',
			sql`length(first_name) BETWEEN 2 AND 100`,
		),
	});
	const { firstName } = createSelectSchema(table).shape;
	// length() counts characters, not UTF-16 units
	expect([
		accepts(firstName, 'a'),
		accepts(firstName, '😀😀'),
		accepts(firstName, '😀'.repeat(100)),
		accepts(firstName, '😀'.repeat(101)),
	])
		.toEqual([false, true, true, false]);
});

test('table containing column with string exclusive length constraints', () => {
	const table = pgTable('products', {
		code: text('code')
			.notNull()
			.checkConstraint('code_min', sql`length(code) > 3`)
			.checkConstraint('code_max', sql`length(code) < 10`),
	});
	const { code } = createSelectSchema(table).shape;
	expect(['abc', 'abcd', 'a'.repeat(9), 'a'.repeat(10)].map((v) => accepts(code, v))).toEqual([
		false,
		true,
		true,
		false,
	]);
});

test('table containing column with LIKE pattern constraint', () => {
	const table = pgTable('accounts', {
		email: text('email').notNull().checkConstraint('email_pattern', sql`email LIKE '%@%.%'`),
	});
	const { email } = createSelectSchema(table).shape;
	// LIKE matches the whole string and is case-sensitive
	expect(['a@b.c', 'ab', 'a@b'].map((v) => accepts(email, v))).toEqual([true, false, false]);
});

test('table containing column with PostgreSQL regex operator constraint', () => {
	const table = pgTable('users', {
		username: text('username').notNull().checkConstraint('username_regex', sql`username ~ '^\\w+$'`),
	});
	const { username } = createSelectSchema(table).shape;
	expect(['abc_1', 'a b', ''].map((v) => accepts(username, v))).toEqual([true, false, false]);
});

// CHECK-derived rules accept exactly what postgres accepts (pg-checks-db.test.ts compares against a real database)
test('check-derived rules follow postgres semantics', () => {
	const ok = (schema: z.ZodType, value: unknown) => expect(schema.safeParse(value).success).toBe(true);
	const bad = (schema: z.ZodType, value: unknown) => expect(schema.safeParse(value).success).toBe(false);
	const table = pgTable('t', {
		either: integer('either').checkConstraint(sql`either < 0 OR either > 100`),
		paid: integer('paid'),
		id: integer('id').checkConstraint(sql`paid > 5`),
		neg: integer('neg').checkConstraint(sql`neg > -10`),
		dec: integer('dec').checkConstraint(sql`dec < 7.9`),
		code: text('code').checkConstraint(sql`code ~ '^[A-Z]+$'`),
		ci: text('ci').checkConstraint(sql`ci ~* '^[a-z]+$'`),
		trimmed: text('trimmed').checkConstraint(sql`length(trim(trimmed)) <= 3`),
		status: text('status').checkConstraint(sql`status IN ('active', 'it''s')`),
		nonEmpty: text('non_empty').checkConstraint(sql`non_empty <> ''`),
		qualified: integer('qualified').checkConstraint(sql`("t"."qualified")::integer >= 1 AND qualified <= 3`),
		big: bigint('big', { mode: 'bigint' }).checkConstraint(sql`big > 10.5`),
		pgOnly: text('pg_only').checkConstraint(sql`pg_only ~ '\\mword\\M'`),
	});
	const s = createInsertSchema(table).shape;

	ok(s.either, 200);
	bad(s.either, 50); // OR is evaluated exactly
	ok(s.id, 1); // check references another column: not checkable per field
	ok(s.neg, -5);
	bad(s.neg, -10);
	ok(s.dec, 7);
	bad(s.dec, 8);
	bad(s.code, 'abc'); // ~ is case-sensitive
	ok(s.ci, 'ABC'); // ~* is not
	ok(s.trimmed, '  ab  '); // the bound applies to the trimmed value
	bad(s.trimmed, ' abcd ');
	ok(s.status, "it's");
	bad(s.status, 'other');
	bad(s.nonEmpty, '');
	ok(s.qualified, 2);
	bad(s.qualified, 4);
	bad(s.big, 10n);
	ok(s.big, 11n);
	ok(s.pgOnly, 'anything'); // postgres-only regex syntax: skipped
});

test('domain nullability and defaults flow into insert schemas', () => {
	const required = pgDomain('required_text', text().notNull());
	const defaulted = pgDomain('defaulted_text', text().notNull().default('x'));
	const table = pgTable('t', { a: required('a'), b: defaulted('b') });
	const s = createInsertSchema(table);
	expect(s.safeParse({ b: 'y' }).success).toBe(false); // a is required by the NOT NULL domain
	expect(s.safeParse({ a: 'y' }).success).toBe(true); // b has a domain default
	expect(s.safeParse({ a: null }).success).toBe(false);
});
