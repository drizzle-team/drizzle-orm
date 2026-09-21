import { describe, expect, test } from 'vitest';
import { is } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import {
	isMySqlCheckViolation,
	isMySqlError,
	isMySqlForeignKeyViolation,
	isMySqlNotNullViolation,
	isMySqlUniqueViolation,
	MYSQL_ERROR,
	MySqlError,
	parseMySqlDuplicateMessage,
	wrapMySqlError,
} from '~/mysql-core/errors.ts';
import {
	isPgCheckViolation,
	isPgError,
	isPgForeignKeyViolation,
	isPgInvalidTextRepresentation,
	isPgNotNullViolation,
	isPgUniqueViolation,
	parsePgDetailKeys,
	PG_ERROR,
	PgError,
	wrapPgError,
} from '~/pg-core/errors.ts';
import {
	classifySqliteConstraint,
	isSqliteError,
	isSqliteUniqueViolation,
	parseSqliteConstraintTarget,
	SqliteError,
	wrapSqliteError,
} from '~/sqlite-core/errors.ts';

describe('parsePgDetailKeys', () => {
	test('parses composite key detail', () => {
		expect(parsePgDetailKeys('Key (email, tenant_id)=(a@b.c, 1) already exists.')).toEqual({
			columns: ['email', 'tenant_id'],
			values: ['a@b.c', '1'],
		});
	});

	test('returns empty for missing detail', () => {
		expect(parsePgDetailKeys(undefined)).toEqual({});
	});
});

describe('wrapPgError', () => {
	test('wraps unique violation with metadata + keyColumns', () => {
		const cause = Object.assign(new Error('duplicate key'), {
			code: '23505',
			severity: 'ERROR',
			detail: 'Key (email)=(user@example.com) already exists.',
			schema: 'public',
			table: 'users',
			constraint: 'users_email_index',
		});
		const err = wrapPgError('insert into users', ['user@example.com'], cause);
		expect(err).toBeInstanceOf(PgError);
		expect(is(err, PgError)).toBe(true);
		expect(isPgError(err)).toBe(true);
		expect(isPgUniqueViolation(err)).toBe(true);
		expect(isPgNotNullViolation(err)).toBe(false);
		const pg = err as PgError;
		expect(pg.code).toBe(PG_ERROR.UNIQUE_VIOLATION);
		expect(pg.table).toBe('users');
		expect(pg.constraint).toBe('users_email_index');
		expect(pg.keyColumns).toEqual(['email']);
		expect(pg.keyValues).toEqual(['user@example.com']);
		expect(pg.getColumnNames()).toEqual(['email']);
		expect(pg.query).toBe('insert into users');
		expect(pg.cause).toBe(cause);
	});

	test('wraps invalid uuid / text representation (22P02)', () => {
		const cause = Object.assign(new Error('invalid input syntax for type uuid'), {
			code: '22P02',
		});
		const err = wrapPgError('select', [], cause);
		expect(isPgInvalidTextRepresentation(err)).toBe(true);
		expect((err as PgError).code).toBe(PG_ERROR.INVALID_TEXT_REPRESENTATION);
	});

	test('wraps FK / not-null / check', () => {
		expect(isPgForeignKeyViolation(wrapPgError('q', [], Object.assign(new Error('fk'), { code: '23503', table: 'posts' })))).toBe(true);
		expect(isPgNotNullViolation(wrapPgError('q', [], Object.assign(new Error('nn'), { code: '23502', column: 'email' })))).toBe(true);
		expect(isPgCheckViolation(wrapPgError('q', [], Object.assign(new Error('ck'), { code: '23514', constraint: 'ck' })))).toBe(true);
	});

	test('reads nested cause.code (drizzle-wrapped / driver nesting)', () => {
		const inner = Object.assign(new Error('dup'), { code: '23505', constraint: 'x' });
		const outer = Object.assign(new Error('wrapper'), { cause: inner });
		const err = wrapPgError('q', [], outer);
		expect(isPgUniqueViolation(err)).toBe(true);
		expect((err as PgError).constraint).toBe('x');
	});

	test('falls back to DrizzleQueryError when no SQLSTATE', () => {
		const err = wrapPgError('q', [1], new Error('boom'));
		expect(err).toBeInstanceOf(DrizzleQueryError);
		expect(err).not.toBeInstanceOf(PgError);
		expect(isPgError(err)).toBe(false);
	});

	test('accepts postgres.js schema_name / table_name aliases', () => {
		const cause = Object.assign(new Error('dup'), {
			code: '23505',
			schema_name: 'public',
			table_name: 'users',
			constraint_name: 'users_email_key',
			column_name: 'email',
		});
		const pg = wrapPgError('q', [], cause) as PgError;
		expect(pg.schema).toBe('public');
		expect(pg.table).toBe('users');
		expect(pg.constraint).toBe('users_email_key');
		expect(pg.column).toBe('email');
	});
});

describe('wrapMySqlError', () => {
	test('parses duplicate entry message', () => {
		expect(parseMySqlDuplicateMessage("Duplicate entry 'a@b.c' for key 'users.users_email_unique'")).toEqual({
			value: 'a@b.c',
			constraint: 'users.users_email_unique',
		});
	});

	test('wraps errno 1062 unique', () => {
		const cause = Object.assign(new Error('dup'), {
			errno: 1062,
			code: 'ER_DUP_ENTRY',
			sqlState: '23000',
			sqlMessage: "Duplicate entry 'a@b.c' for key 'users.users_email_unique'",
		});
		const err = wrapMySqlError('insert', [], cause);
		expect(is(err, MySqlError)).toBe(true);
		expect(isMySqlError(err)).toBe(true);
		expect(isMySqlUniqueViolation(err)).toBe(true);
		const my = err as MySqlError;
		expect(my.errno).toBe(MYSQL_ERROR.DUP_ENTRY);
		expect(my.constraint).toBe('users.users_email_unique');
		expect(my.duplicateValue).toBe('a@b.c');
	});

	test('maps ER_* string codes when errno missing', () => {
		const err = wrapMySqlError('q', [], Object.assign(new Error('nn'), { code: 'ER_BAD_NULL_ERROR', message: "Column 'email' cannot be null" }));
		expect(isMySqlNotNullViolation(err)).toBe(true);
		expect((err as MySqlError).column).toBe('email');
	});

	test('FK / check classification', () => {
		expect(isMySqlForeignKeyViolation(wrapMySqlError('q', [], Object.assign(new Error('fk'), { errno: 1452 })))).toBe(true);
		expect(isMySqlForeignKeyViolation(wrapMySqlError('q', [], Object.assign(new Error('fk'), { errno: 1451 })))).toBe(true);
		expect(isMySqlCheckViolation(wrapMySqlError('q', [], Object.assign(new Error('ck'), { errno: 3819 })))).toBe(true);
	});

	test('falls back without errno', () => {
		const err = wrapMySqlError('q', [], new Error('nope'));
		expect(err).toBeInstanceOf(DrizzleQueryError);
		expect(isMySqlError(err)).toBe(false);
	});
});

describe('wrapSqliteError', () => {
	test('classifies unique from extended code', () => {
		expect(classifySqliteConstraint('SQLITE_CONSTRAINT_UNIQUE', undefined)).toBe('unique');
		expect(parseSqliteConstraintTarget('UNIQUE constraint failed: users.email')).toEqual({
			table: 'users',
			columns: ['email'],
		});
	});

	test('wraps unique + libsql message fallback', () => {
		const cause = Object.assign(new Error('UNIQUE constraint failed: users.email'), {
			code: 'SQLITE_CONSTRAINT',
		});
		const err = wrapSqliteError('insert', [], cause);
		expect(is(err, SqliteError)).toBe(true);
		expect(isSqliteError(err)).toBe(true);
		expect(isSqliteUniqueViolation(err)).toBe(true);
		const s = err as SqliteError;
		expect(s.constraintKind).toBe('unique');
		expect(s.table).toBe('users');
		expect(s.columns).toEqual(['email']);
	});

	test('falls back for non-constraint errors', () => {
		const err = wrapSqliteError('q', [], Object.assign(new Error('no such table'), { code: 'SQLITE_ERROR' }));
		expect(err).toBeInstanceOf(DrizzleQueryError);
		expect(isSqliteError(err)).toBe(false);
	});
});
