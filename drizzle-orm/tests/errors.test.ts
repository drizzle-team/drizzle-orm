import { describe, expect, test } from 'vitest';
import {
	CheckConstraintViolationError,
	DrizzleConstraintError,
	DrizzleQueryError,
	ForeignKeyViolationError,
	NotNullViolationError,
	UniqueConstraintViolationError,
	wrapQueryError,
} from '~/errors.ts';

describe('wrapQueryError', () => {
	const query = 'INSERT INTO users (email) VALUES ($1)';
	const params = ['test@example.com'];

	describe('PostgreSQL errors', () => {
		test('wraps unique_violation (23505)', () => {
			const pgError = Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
				code: '23505',
				table: 'users',
				column: undefined,
				constraint: 'users_email_key',
			});

			const wrapped = wrapQueryError(query, params, pgError);

			expect(wrapped).toBeInstanceOf(UniqueConstraintViolationError);
			expect(wrapped).toBeInstanceOf(DrizzleConstraintError);
			expect(wrapped).toBeInstanceOf(DrizzleQueryError);
			expect((wrapped as UniqueConstraintViolationError).constraintType).toBe('unique');
			expect((wrapped as UniqueConstraintViolationError).constraintName).toBe('users_email_key');
			expect((wrapped as UniqueConstraintViolationError).table).toBe('users');
			expect(wrapped.cause).toBe(pgError);
		});

		test('wraps not_null_violation (23502)', () => {
			const pgError = Object.assign(new Error('null value in column "name" violates not-null constraint'), {
				code: '23502',
				table: 'users',
				column: 'name',
				constraint: undefined,
			});

			const wrapped = wrapQueryError(query, params, pgError);

			expect(wrapped).toBeInstanceOf(NotNullViolationError);
			expect((wrapped as NotNullViolationError).constraintType).toBe('not_null');
			expect((wrapped as NotNullViolationError).table).toBe('users');
			expect((wrapped as NotNullViolationError).column).toBe('name');
			expect(wrapped.cause).toBe(pgError);
		});

		test('wraps foreign_key_violation (23503)', () => {
			const pgError = Object.assign(new Error('insert or update on table "posts" violates foreign key constraint'), {
				code: '23503',
				table: 'posts',
				column: undefined,
				constraint: 'posts_user_id_fkey',
			});

			const wrapped = wrapQueryError(query, params, pgError);

			expect(wrapped).toBeInstanceOf(ForeignKeyViolationError);
			expect((wrapped as ForeignKeyViolationError).constraintType).toBe('foreign_key');
			expect((wrapped as ForeignKeyViolationError).constraintName).toBe('posts_user_id_fkey');
			expect(wrapped.cause).toBe(pgError);
		});

		test('wraps check_violation (23514)', () => {
			const pgError = Object.assign(new Error('new row for relation "users" violates check constraint'), {
				code: '23514',
				table: 'users',
				column: undefined,
				constraint: 'users_age_check',
			});

			const wrapped = wrapQueryError(query, params, pgError);

			expect(wrapped).toBeInstanceOf(CheckConstraintViolationError);
			expect((wrapped as CheckConstraintViolationError).constraintType).toBe('check');
			expect((wrapped as CheckConstraintViolationError).constraintName).toBe('users_age_check');
			expect(wrapped.cause).toBe(pgError);
		});
	});

	describe('MySQL errors', () => {
		test('wraps ER_DUP_ENTRY (1062)', () => {
			const mysqlError = Object.assign(new Error("Duplicate entry 'test@example.com' for key 'users_email_unique'"), {
				errno: 1062,
				sqlMessage: "Duplicate entry 'test@example.com' for key 'users_email_unique'",
			});

			const wrapped = wrapQueryError(query, params, mysqlError);

			expect(wrapped).toBeInstanceOf(UniqueConstraintViolationError);
			expect((wrapped as UniqueConstraintViolationError).constraintName).toBe('users_email_unique');
			expect(wrapped.cause).toBe(mysqlError);
		});

		test('wraps ER_BAD_NULL_ERROR (1048)', () => {
			const mysqlError = Object.assign(new Error("Column 'name' cannot be null"), {
				errno: 1048,
				sqlMessage: "Column 'name' cannot be null",
			});

			const wrapped = wrapQueryError(query, params, mysqlError);

			expect(wrapped).toBeInstanceOf(NotNullViolationError);
			expect((wrapped as NotNullViolationError).column).toBe('name');
			expect(wrapped.cause).toBe(mysqlError);
		});

		test('wraps ER_NO_REFERENCED_ROW_2 (1452)', () => {
			const mysqlError = Object.assign(
				new Error(
					"Cannot add or update a child row: a foreign key constraint fails (`db`.`posts`, CONSTRAINT `posts_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`))",
				),
				{
					errno: 1452,
					sqlMessage:
						"Cannot add or update a child row: a foreign key constraint fails (`db`.`posts`, CONSTRAINT `posts_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`))",
				},
			);

			const wrapped = wrapQueryError(query, params, mysqlError);

			expect(wrapped).toBeInstanceOf(ForeignKeyViolationError);
			expect((wrapped as ForeignKeyViolationError).constraintName).toBe('posts_user_id_fk');
			expect(wrapped.cause).toBe(mysqlError);
		});

		test('wraps ER_CHECK_CONSTRAINT_VIOLATED (3819)', () => {
			const mysqlError = Object.assign(new Error("Check constraint 'users_age_check' is violated."), {
				errno: 3819,
				sqlMessage: "Check constraint 'users_age_check' is violated.",
			});

			const wrapped = wrapQueryError(query, params, mysqlError);

			expect(wrapped).toBeInstanceOf(CheckConstraintViolationError);
			expect((wrapped as CheckConstraintViolationError).constraintName).toBe('users_age_check');
			expect(wrapped.cause).toBe(mysqlError);
		});
	});

	describe('SQLite errors', () => {
		test('wraps SQLITE_CONSTRAINT_UNIQUE via code', () => {
			const sqliteError = Object.assign(new Error('UNIQUE constraint failed: users.email'), {
				code: 'SQLITE_CONSTRAINT_UNIQUE',
			});

			const wrapped = wrapQueryError(query, params, sqliteError);

			expect(wrapped).toBeInstanceOf(UniqueConstraintViolationError);
			expect((wrapped as UniqueConstraintViolationError).table).toBe('users');
			expect((wrapped as UniqueConstraintViolationError).column).toBe('email');
			expect(wrapped.cause).toBe(sqliteError);
		});

		test('wraps SQLITE_CONSTRAINT_NOTNULL via code', () => {
			const sqliteError = Object.assign(new Error('NOT NULL constraint failed: users.name'), {
				code: 'SQLITE_CONSTRAINT_NOTNULL',
			});

			const wrapped = wrapQueryError(query, params, sqliteError);

			expect(wrapped).toBeInstanceOf(NotNullViolationError);
			expect((wrapped as NotNullViolationError).table).toBe('users');
			expect((wrapped as NotNullViolationError).column).toBe('name');
			expect(wrapped.cause).toBe(sqliteError);
		});

		test('wraps SQLITE_CONSTRAINT_FOREIGNKEY via code', () => {
			const sqliteError = Object.assign(new Error('FOREIGN KEY constraint failed'), {
				code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
			});

			const wrapped = wrapQueryError(query, params, sqliteError);

			expect(wrapped).toBeInstanceOf(ForeignKeyViolationError);
			expect(wrapped.cause).toBe(sqliteError);
		});

		test('wraps SQLITE_CONSTRAINT_CHECK via code', () => {
			const sqliteError = Object.assign(new Error('CHECK constraint failed: users_age_check'), {
				code: 'SQLITE_CONSTRAINT_CHECK',
			});

			const wrapped = wrapQueryError(query, params, sqliteError);

			expect(wrapped).toBeInstanceOf(CheckConstraintViolationError);
			expect(wrapped.cause).toBe(sqliteError);
		});

		test('wraps UNIQUE constraint from message (libsql fallback)', () => {
			const sqliteError = new Error('UNIQUE constraint failed: users.email');

			const wrapped = wrapQueryError(query, params, sqliteError);

			expect(wrapped).toBeInstanceOf(UniqueConstraintViolationError);
			expect((wrapped as UniqueConstraintViolationError).table).toBe('users');
			expect((wrapped as UniqueConstraintViolationError).column).toBe('email');
		});

		test('wraps NOT NULL constraint from message (libsql fallback)', () => {
			const sqliteError = new Error('NOT NULL constraint failed: users.name');

			const wrapped = wrapQueryError(query, params, sqliteError);

			expect(wrapped).toBeInstanceOf(NotNullViolationError);
			expect((wrapped as NotNullViolationError).table).toBe('users');
			expect((wrapped as NotNullViolationError).column).toBe('name');
		});

		test('wraps SQLITE_CONSTRAINT_PRIMARYKEY as unique', () => {
			const sqliteError = Object.assign(new Error('UNIQUE constraint failed: users.id'), {
				code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
			});

			const wrapped = wrapQueryError(query, params, sqliteError);

			expect(wrapped).toBeInstanceOf(UniqueConstraintViolationError);
		});
	});

	describe('unknown errors', () => {
		test('falls back to DrizzleQueryError for unknown error codes', () => {
			const unknownError = Object.assign(new Error('some random error'), {
				code: '42P01', // relation does not exist
			});

			const wrapped = wrapQueryError(query, params, unknownError);

			expect(wrapped).toBeInstanceOf(DrizzleQueryError);
			expect(wrapped).not.toBeInstanceOf(DrizzleConstraintError);
			expect(wrapped.cause).toBe(unknownError);
		});

		test('falls back for errors with no recognizable properties', () => {
			const plainError = new Error('connection refused');

			const wrapped = wrapQueryError(query, params, plainError);

			expect(wrapped).toBeInstanceOf(DrizzleQueryError);
			expect(wrapped).not.toBeInstanceOf(DrizzleConstraintError);
		});
	});

	describe('instanceof chain', () => {
		test('UniqueConstraintViolationError is instanceof all parent classes', () => {
			const pgError = Object.assign(new Error('duplicate key'), {
				code: '23505',
				table: 'users',
				constraint: 'users_email_key',
			});

			const wrapped = wrapQueryError(query, params, pgError);

			expect(wrapped).toBeInstanceOf(UniqueConstraintViolationError);
			expect(wrapped).toBeInstanceOf(DrizzleConstraintError);
			expect(wrapped).toBeInstanceOf(DrizzleQueryError);
			expect(wrapped).toBeInstanceOf(Error);
		});

		test('query and params are accessible on constraint errors', () => {
			const pgError = Object.assign(new Error('duplicate key'), {
				code: '23505',
				table: 'users',
				constraint: 'users_email_key',
			});

			const wrapped = wrapQueryError(query, params, pgError) as UniqueConstraintViolationError;

			expect(wrapped.query).toBe(query);
			expect(wrapped.params).toEqual(params);
			expect(wrapped.constraintType).toBe('unique');
			expect(wrapped.constraintName).toBe('users_email_key');
			expect(wrapped.table).toBe('users');
		});
	});
});
