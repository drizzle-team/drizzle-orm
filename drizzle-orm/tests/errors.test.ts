import { describe, expect, test } from 'vitest';
import {
	CheckConstraintError,
	DrizzleQueryError,
	ForeignKeyConstraintError,
	NotNullConstraintError,
	UniqueConstraintError,
	is,
	wrapMySqlError,
	wrapPgError,
	wrapSqliteError,
} from '~/index.ts';

const q = 'select 1';
const p: any[] = [];

describe('constraint error wrapping', () => {
	test('pg unique violation', () => {
		const cause = Object.assign(new Error('duplicate key'), {
			code: '23505',
			constraint: 'users_email_index',
			table: 'users',
			column: 'email',
		});
		const err = wrapPgError(q, p, cause);
		expect(is(err, UniqueConstraintError)).toBe(true);
		expect(err.constraintName).toBe('users_email_index');
		expect(err.table).toBe('users');
		expect(err.columns).toEqual(['email']);
		expect(err.cause).toBe(cause);
	});

	test('pg not null violation', () => {
		const cause = Object.assign(new Error('null value'), { code: '23502', table: 'users', column: 'name' });
		const err = wrapPgError(q, p, cause);
		expect(is(err, NotNullConstraintError)).toBe(true);
		expect(err.kind).toBe('not_null');
	});

	test('pg foreign key violation', () => {
		const cause = Object.assign(new Error('fk'), { code: '23503', constraint: 'fk_user' });
		const err = wrapPgError(q, p, cause);
		expect(is(err, ForeignKeyConstraintError)).toBe(true);
	});

	test('pg check violation', () => {
		const cause = Object.assign(new Error('check'), { code: '23514', constraint: 'chk_age' });
		const err = wrapPgError(q, p, cause);
		expect(is(err, CheckConstraintError)).toBe(true);
	});

	test('pg unknown code falls back to DrizzleQueryError', () => {
		const cause = Object.assign(new Error('syntax'), { code: '42601' });
		const err = wrapPgError(q, p, cause);
		expect(is(err, DrizzleQueryError)).toBe(true);
		expect(is(err, UniqueConstraintError)).toBe(false);
	});

	test('mysql unique violation', () => {
		const cause = Object.assign(new Error('dup'), {
			errno: 1062,
			sqlMessage: "Duplicate entry 'x' for key 'users_email_unique'",
		});
		const err = wrapMySqlError(q, p, cause);
		expect(is(err, UniqueConstraintError)).toBe(true);
		expect(err.constraintName).toBe('users_email_unique');
	});

	test('mysql not null violation', () => {
		const cause = Object.assign(new Error('null'), {
			errno: 1048,
			sqlMessage: "Column 'email' cannot be null",
		});
		const err = wrapMySqlError(q, p, cause);
		expect(is(err, NotNullConstraintError)).toBe(true);
		expect(err.columns).toEqual(['email']);
	});

	test('sqlite unique via extended code', () => {
		const cause = Object.assign(new Error('unique'), {
			code: 'SQLITE_CONSTRAINT_UNIQUE',
			message: 'UNIQUE constraint failed: users.email',
		});
		const err = wrapSqliteError(q, p, cause);
		expect(is(err, UniqueConstraintError)).toBe(true);
		expect(err.table).toBe('users');
		expect(err.columns).toEqual(['email']);
	});

	test('sqlite libsql message fallback', () => {
		const cause = new Error('NOT NULL constraint failed: users.name');
		const err = wrapSqliteError(q, p, cause);
		expect(is(err, NotNullConstraintError)).toBe(true);
		expect(err.table).toBe('users');
		expect(err.columns).toEqual(['name']);
	});

	test('constraint errors extend DrizzleQueryError', () => {
		const cause = Object.assign(new Error('dup'), { code: '23505' });
		const err = wrapPgError(q, p, cause);
		expect(is(err, DrizzleQueryError)).toBe(true);
		expect(is(err, UniqueConstraintError)).toBe(true);
	});
});
