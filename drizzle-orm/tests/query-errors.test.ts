import { expect, test } from 'vitest';

import { DrizzleQueryError, type DrizzleQueryErrorType } from '~/errors.ts';

function driverError(message: string, fields: Record<string, unknown>): Error {
	return Object.assign(new Error(message), fields);
}

test('normalizes PostgreSQL constraint errors', () => {
	const cause = driverError('duplicate key value violates unique constraint', {
		code: '23505',
		table: 'users',
		column: 'email',
		constraint: 'users_email_key',
	});
	const error = new DrizzleQueryError('insert into users ...', ['a@example.com'], cause);

	expect(error.type).toBe('unique');
	expect(error.code).toBe('23505');
	expect(error.table).toBe('users');
	expect(error.column).toBe('email');
	expect(error.constraint).toBe('users_email_key');
	expect(error.cause).toBe(cause);
});

test('normalizes MySQL constraint errors from errno', () => {
	const error = new DrizzleQueryError(
		'insert into users ...',
		[],
		driverError("Duplicate entry 'a@example.com' for key 'users.email'", {
			errno: 1062,
			code: 'ER_DUP_ENTRY',
			sqlState: '23000',
		}),
	);

	expect(error.type).toBe('unique');
	expect(error.code).toBe('ER_DUP_ENTRY');
});

test('normalizes SQLite constraint errors and extracts table/column', () => {
	const error = new DrizzleQueryError(
		'insert into users ...',
		[],
		driverError('UNIQUE constraint failed: users.email', {
			code: 'SQLITE_CONSTRAINT_UNIQUE',
			errcode: 2067,
		}),
	);

	expect(error.type).toBe('unique');
	expect(error.table).toBe('users');
	expect(error.column).toBe('email');
});

test.each([
	['23502', 'not_null'],
	['23503', 'foreign_key'],
	['23514', 'check'],
	[1048, 'not_null'],
	[1452, 'foreign_key'],
	[3819, 'check'],
	['SQLITE_CONSTRAINT_NOTNULL', 'not_null'],
	['SQLITE_CONSTRAINT_FOREIGNKEY', 'foreign_key'],
	['SQLITE_CONSTRAINT_CHECK', 'check'],
] as const)('maps driver code %s to %s', (code, expected) => {
	const error = new DrizzleQueryError('query', [], driverError('failure', { code }));
	expect(error.type).toBe(expected);
});

test('unknown database errors preserve existing DrizzleQueryError behavior', () => {
	const cause = driverError('connection reset', { code: 'ECONNRESET' });
	const error = new DrizzleQueryError('select 1', [], cause);

	expect(error.type).toBeUndefined();
	expect(error.code).toBe('ECONNRESET');
	expect(error.cause).toBe(cause);
});

test('query error type is compile-time constrained', () => {
	const valid: DrizzleQueryErrorType = 'unique';
	expect(valid).toBe('unique');

	// @ts-expect-error invalid query-error discriminators should fail at compile time
	const invalid: DrizzleQueryErrorType = 'unknown_type';
	expect(invalid).toBe('unknown_type');
});
