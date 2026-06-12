import { describe, expect, test } from 'vitest';
import { is } from '~/entity.ts';
import {
	CheckConstraintError,
	DrizzleConstraintError,
	DrizzleQueryError,
	ForeignKeyConstraintError,
	NotNullConstraintError,
	UniqueConstraintError,
	wrapMySqlError,
	wrapPgError,
	wrapSqliteError,
} from '~/errors.ts';

const query = 'insert into "users" ("email") values ($1)';
const params = ['test@example.com'];

function pgError(props: Record<string, unknown>): Error {
	return Object.assign(new Error('pg error'), props);
}

describe('wrapPgError', () => {
	test('unique_violation (23505)', () => {
		const cause = pgError({ code: '23505', table: 'users', constraint: 'users_email_unique' });
		const wrapped = wrapPgError(query, params, cause);

		expect(wrapped).toBeInstanceOf(UniqueConstraintError);
		expect(is(wrapped, UniqueConstraintError)).toBe(true);
		expect(is(wrapped, DrizzleConstraintError)).toBe(true);
		expect(is(wrapped, DrizzleQueryError)).toBe(true);
		const e = wrapped as UniqueConstraintError;
		expect(e.kind).toBe('unique');
		expect(e.constraintName).toBe('users_email_unique');
		expect(e.table).toBe('users');
		expect(e.cause).toBe(cause);
		expect(e.query).toBe(query);
		expect(e.params).toEqual(params);
	});

	test('not_null_violation (23502)', () => {
		const cause = pgError({ code: '23502', table: 'users', column: 'name' });
		const wrapped = wrapPgError(query, params, cause) as NotNullConstraintError;

		expect(is(wrapped, NotNullConstraintError)).toBe(true);
		expect(wrapped.kind).toBe('not_null');
		expect(wrapped.table).toBe('users');
		expect(wrapped.columns).toEqual(['name']);
	});

	test('foreign_key_violation (23503)', () => {
		const cause = pgError({ code: '23503', table: 'posts', constraint: 'posts_user_id_fk' });
		const wrapped = wrapPgError(query, params, cause) as ForeignKeyConstraintError;

		expect(is(wrapped, ForeignKeyConstraintError)).toBe(true);
		expect(wrapped.kind).toBe('foreign_key');
		expect(wrapped.constraintName).toBe('posts_user_id_fk');
	});

	test('check_violation (23514)', () => {
		const cause = pgError({ code: '23514', table: 'users', constraint: 'users_age_check' });
		const wrapped = wrapPgError(query, params, cause) as CheckConstraintError;

		expect(is(wrapped, CheckConstraintError)).toBe(true);
		expect(wrapped.kind).toBe('check');
		expect(wrapped.constraintName).toBe('users_age_check');
	});

	test('reads postgres.js name aliases (constraint_name/table_name/column_name)', () => {
		const cause = pgError({
			code: '23505',
			table_name: 'users',
			column_name: 'email',
			constraint_name: 'users_email_unique',
		});
		const wrapped = wrapPgError(query, params, cause) as UniqueConstraintError;

		expect(wrapped.constraintName).toBe('users_email_unique');
		expect(wrapped.table).toBe('users');
		expect(wrapped.columns).toEqual(['email']);
	});

	test('falls back to DrizzleQueryError for unrecognized SQLSTATE', () => {
		const cause = pgError({ code: '42P01' }); // undefined_table
		const wrapped = wrapPgError(query, params, cause);

		expect(is(wrapped, DrizzleQueryError)).toBe(true);
		expect(is(wrapped, DrizzleConstraintError)).toBe(false);
		expect(wrapped.cause).toBe(cause);
	});

	test('falls back when there is no code', () => {
		const cause = new Error('connection refused');
		const wrapped = wrapPgError(query, params, cause);

		expect(is(wrapped, DrizzleQueryError)).toBe(true);
		expect(is(wrapped, DrizzleConstraintError)).toBe(false);
	});
});

describe('wrapMySqlError', () => {
	test('ER_DUP_ENTRY (1062)', () => {
		const cause = Object.assign(new Error('dup'), {
			errno: 1062,
			sqlMessage: "Duplicate entry 'test@example.com' for key 'users_email_unique'",
		});
		const wrapped = wrapMySqlError(query, params, cause) as UniqueConstraintError;

		expect(is(wrapped, UniqueConstraintError)).toBe(true);
		expect(wrapped.constraintName).toBe('users_email_unique');
		expect(wrapped.cause).toBe(cause);
	});

	test('ER_BAD_NULL_ERROR (1048)', () => {
		const cause = Object.assign(new Error('null'), {
			errno: 1048,
			sqlMessage: "Column 'name' cannot be null",
		});
		const wrapped = wrapMySqlError(query, params, cause) as NotNullConstraintError;

		expect(is(wrapped, NotNullConstraintError)).toBe(true);
		expect(wrapped.columns).toEqual(['name']);
	});

	test('ER_NO_REFERENCED_ROW_2 (1452)', () => {
		const cause = Object.assign(new Error('fk'), {
			errno: 1452,
			sqlMessage:
				'Cannot add or update a child row: a foreign key constraint fails (`db`.`posts`, CONSTRAINT `posts_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`))',
		});
		const wrapped = wrapMySqlError(query, params, cause) as ForeignKeyConstraintError;

		expect(is(wrapped, ForeignKeyConstraintError)).toBe(true);
		expect(wrapped.constraintName).toBe('posts_user_id_fk');
		expect(wrapped.table).toBe('posts');
	});

	test('ER_CHECK_CONSTRAINT_VIOLATED (3819)', () => {
		const cause = Object.assign(new Error('check'), {
			errno: 3819,
			sqlMessage: "Check constraint 'users_age_check' is violated.",
		});
		const wrapped = wrapMySqlError(query, params, cause) as CheckConstraintError;

		expect(is(wrapped, CheckConstraintError)).toBe(true);
		expect(wrapped.constraintName).toBe('users_age_check');
	});

	test('falls back when there is no errno', () => {
		const cause = new Error('some non-mysql2 error');
		const wrapped = wrapMySqlError(query, params, cause);

		expect(is(wrapped, DrizzleQueryError)).toBe(true);
		expect(is(wrapped, DrizzleConstraintError)).toBe(false);
	});
});

describe('wrapSqliteError', () => {
	test('SQLITE_CONSTRAINT_UNIQUE via extended code', () => {
		const cause = Object.assign(new Error('UNIQUE constraint failed: users.email'), {
			code: 'SQLITE_CONSTRAINT_UNIQUE',
		});
		const wrapped = wrapSqliteError(query, params, cause) as UniqueConstraintError;

		expect(is(wrapped, UniqueConstraintError)).toBe(true);
		expect(wrapped.table).toBe('users');
		expect(wrapped.columns).toEqual(['email']);
	});

	test('SQLITE_CONSTRAINT_PRIMARYKEY maps to unique', () => {
		const cause = Object.assign(new Error('UNIQUE constraint failed: users.id'), {
			code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
		});
		const wrapped = wrapSqliteError(query, params, cause);

		expect(is(wrapped, UniqueConstraintError)).toBe(true);
	});

	test('composite unique extracts all columns', () => {
		const cause = Object.assign(new Error('UNIQUE constraint failed: t.a, t.b'), {
			code: 'SQLITE_CONSTRAINT_UNIQUE',
		});
		const wrapped = wrapSqliteError(query, params, cause) as UniqueConstraintError;

		expect(wrapped.table).toBe('t');
		expect(wrapped.columns).toEqual(['a', 'b']);
	});

	test('NOT NULL via message fallback (libsql/d1 have no extended code)', () => {
		const cause = new Error('NOT NULL constraint failed: users.name');
		const wrapped = wrapSqliteError(query, params, cause) as NotNullConstraintError;

		expect(is(wrapped, NotNullConstraintError)).toBe(true);
		expect(wrapped.table).toBe('users');
		expect(wrapped.columns).toEqual(['name']);
	});

	test('FOREIGN KEY via message fallback', () => {
		const cause = new Error('FOREIGN KEY constraint failed');
		const wrapped = wrapSqliteError(query, params, cause);

		expect(is(wrapped, ForeignKeyConstraintError)).toBe(true);
	});

	test('CHECK via message fallback extracts name', () => {
		const cause = new Error('CHECK constraint failed: users_age_check');
		const wrapped = wrapSqliteError(query, params, cause) as CheckConstraintError;

		expect(is(wrapped, CheckConstraintError)).toBe(true);
		expect(wrapped.constraintName).toBe('users_age_check');
	});

	test('falls back to DrizzleQueryError for non-constraint errors', () => {
		const cause = Object.assign(new Error('no such table: users'), { code: 'SQLITE_ERROR' });
		const wrapped = wrapSqliteError(query, params, cause);

		expect(is(wrapped, DrizzleQueryError)).toBe(true);
		expect(is(wrapped, DrizzleConstraintError)).toBe(false);
	});
});

describe('error class shape', () => {
	test('full inheritance chain and discriminant switch', () => {
		const wrapped = wrapPgError(query, params, pgError({ code: '23505', constraint: 'c' }));

		expect(wrapped).toBeInstanceOf(Error);
		expect(wrapped).toBeInstanceOf(DrizzleQueryError);
		expect(wrapped).toBeInstanceOf(DrizzleConstraintError);
		expect(wrapped).toBeInstanceOf(UniqueConstraintError);

		const constraint = wrapped as DrizzleConstraintError;
		let label: string;
		switch (constraint.kind) {
			case 'unique': {
				label = 'unique';
				break;
			}
			default: {
				label = 'other';
			}
		}
		expect(label).toBe('unique');
	});
});
