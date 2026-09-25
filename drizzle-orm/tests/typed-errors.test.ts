import { describe, expect, test } from 'vitest';
import { is } from '~/entity.ts';
import {
	CheckConstraintError,
	DrizzleQueryError,
	ForeignKeyConstraintError,
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isNotNullConstraintError,
	isUniqueConstraintError,
	NotNullConstraintError,
	parseDatabaseError,
	UniqueConstraintError,
} from '~/errors.ts';

describe('Typed Database Error Wrapping (#376)', () => {
	describe('PostgreSQL Errors', () => {
		test('wraps 23505 unique violation into UniqueConstraintError', () => {
			const pgError = {
				code: '23505',
				constraint: 'users_email_unique',
				table: 'users',
				detail: 'Key (email)=(test@example.com) already exists.',
				schema: 'public',
			};

			const err = new DrizzleQueryError('INSERT INTO users ...', ['test@example.com'], pgError as any);

			expect(err).toBeInstanceOf(DrizzleQueryError);
			expect(err).toBeInstanceOf(UniqueConstraintError);
			expect(is(err, DrizzleQueryError)).toBe(true);
			expect(is(err, UniqueConstraintError)).toBe(true);
			expect(isUniqueConstraintError(err)).toBe(true);
			expect(err.isUniqueConstraint()).toBe(true);
			expect(err.isForeignKeyConstraint()).toBe(false);

			expect(err.kind).toBe('unique_constraint');
			expect(err.code).toBe('23505');
			expect(err.constraint).toBe('users_email_unique');
			expect(err.table).toBe('users');
			expect(err.detail).toBe('Key (email)=(test@example.com) already exists.');
			expect(err.schema).toBe('public');
			expect(err.query).toBe('INSERT INTO users ...');
			expect(err.params).toEqual(['test@example.com']);
			expect(err.cause).toBe(pgError);
		});

		test('wraps 23503 foreign key violation into ForeignKeyConstraintError', () => {
			const pgError = {
				code: '23503',
				constraint: 'orders_user_id_fk',
				table: 'orders',
				detail: 'Key (user_id)=(999) is not present in table "users".',
			};

			const err = new DrizzleQueryError('INSERT INTO orders ...', [999], pgError as any);

			expect(err).toBeInstanceOf(DrizzleQueryError);
			expect(err).toBeInstanceOf(ForeignKeyConstraintError);
			expect(is(err, ForeignKeyConstraintError)).toBe(true);
			expect(isForeignKeyConstraintError(err)).toBe(true);
			expect(err.isForeignKeyConstraint()).toBe(true);
			expect(err.constraint).toBe('orders_user_id_fk');
			expect(err.table).toBe('orders');
		});

		test('wraps 23502 not null violation into NotNullConstraintError', () => {
			const pgError = {
				code: '23502',
				column: 'email',
				table: 'users',
			};

			const err = new DrizzleQueryError('INSERT INTO users ...', [null], pgError as any);

			expect(err).toBeInstanceOf(DrizzleQueryError);
			expect(err).toBeInstanceOf(NotNullConstraintError);
			expect(is(err, NotNullConstraintError)).toBe(true);
			expect(isNotNullConstraintError(err)).toBe(true);
			expect(err.isNotNullConstraint()).toBe(true);
			expect(err.column).toBe('email');
			expect(err.table).toBe('users');
		});

		test('wraps 23514 check violation into CheckConstraintError', () => {
			const pgError = {
				code: '23514',
				constraint: 'positive_price',
				table: 'products',
			};

			const err = new DrizzleQueryError('INSERT INTO products ...', [-10], pgError as any);

			expect(err).toBeInstanceOf(DrizzleQueryError);
			expect(err).toBeInstanceOf(CheckConstraintError);
			expect(is(err, CheckConstraintError)).toBe(true);
			expect(isCheckConstraintError(err)).toBe(true);
			expect(err.isCheckConstraint()).toBe(true);
			expect(err.constraint).toBe('positive_price');
		});
	});

	describe('MySQL Errors', () => {
		test('wraps ER_DUP_ENTRY / 1062 into UniqueConstraintError with extracted constraint', () => {
			const mysqlError = {
				code: 'ER_DUP_ENTRY',
				errno: 1062,
				message: "Duplicate entry 'admin@example.com' for key 'users.users_email_unique'",
			};

			const err = new DrizzleQueryError('INSERT INTO users ...', ['admin@example.com'], mysqlError as any);

			expect(err).toBeInstanceOf(UniqueConstraintError);
			expect(err.kind).toBe('unique_constraint');
			expect(err.constraint).toBe('users_email_unique');
			expect(err.detail).toBe('admin@example.com');
		});

		test('wraps ER_NO_REFERENCED_ROW_2 / 1452 into ForeignKeyConstraintError', () => {
			const mysqlError = {
				code: 'ER_NO_REFERENCED_ROW_2',
				errno: 1452,
				message: 'Cannot add or update a child row: a foreign key constraint fails',
			};

			const err = new DrizzleQueryError('INSERT INTO orders ...', [1], mysqlError as any);

			expect(err).toBeInstanceOf(ForeignKeyConstraintError);
			expect(err.isForeignKeyConstraint()).toBe(true);
		});

		test('wraps ER_BAD_NULL_ERROR / 1048 into NotNullConstraintError with column extraction', () => {
			const mysqlError = {
				code: 'ER_BAD_NULL_ERROR',
				errno: 1048,
				message: "Column 'username' cannot be null",
			};

			const err = new DrizzleQueryError('INSERT INTO users ...', [null], mysqlError as any);

			expect(err).toBeInstanceOf(NotNullConstraintError);
			expect(err.column).toBe('username');
		});
	});

	describe('SQLite Errors', () => {
		test('wraps SQLITE_CONSTRAINT_UNIQUE with parsed table and column', () => {
			const sqliteError = {
				code: 'SQLITE_CONSTRAINT',
				message: 'UNIQUE constraint failed: users.email',
			};

			const err = new DrizzleQueryError('INSERT INTO users ...', ['dup@test.com'], sqliteError as any);

			expect(err).toBeInstanceOf(UniqueConstraintError);
			expect(err.table).toBe('users');
			expect(err.column).toBe('email');
		});

		test('wraps SQLite foreign key violation', () => {
			const sqliteError = {
				code: 'SQLITE_CONSTRAINT',
				message: 'FOREIGN KEY constraint failed',
			};

			const err = new DrizzleQueryError('INSERT INTO orders ...', [5], sqliteError as any);

			expect(err).toBeInstanceOf(ForeignKeyConstraintError);
			expect(err.isForeignKeyConstraint()).toBe(true);
		});

		test('wraps SQLite NOT NULL violation with column', () => {
			const sqliteError = {
				code: 'SQLITE_CONSTRAINT_NOTNULL',
				message: 'NOT NULL constraint failed: profile.bio',
			};

			const err = new DrizzleQueryError('INSERT INTO profile ...', [null], sqliteError as any);

			expect(err).toBeInstanceOf(NotNullConstraintError);
			expect(err.table).toBe('profile');
			expect(err.column).toBe('bio');
		});
	});

	describe('Fallback & Backwards Compatibility', () => {
		test('handles unknown errors gracefully without crashing', () => {
			const unknownErr = new Error('Network timeout');
			const err = new DrizzleQueryError('SELECT 1', [], unknownErr);

			expect(err).toBeInstanceOf(DrizzleQueryError);
			expect(err.kind).toBe('unknown');
			expect(err.isUniqueConstraint()).toBe(false);
			expect(err.isForeignKeyConstraint()).toBe(false);
			expect(err.query).toBe('SELECT 1');
			expect(err.params).toEqual([]);
		});

		test('handles undefined cause gracefully', () => {
			const err = new DrizzleQueryError('SELECT 1', []);
			expect(err.kind).toBe('unknown');
			expect(err.cause).toBeUndefined();
		});
	});
});
