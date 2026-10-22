import { describe, expect, test } from 'vitest';
import {
	CheckConstraintError,
	DrizzleConstraintError,
	DrizzleError,
	ForeignKeyConstraintError,
	mapDriverError,
	NotNullConstraintError,
	UniqueConstraintError,
	withDriverErrorMapping,
} from '~/errors.ts';

describe('Error Handling and Driver Error Mapping (#376)', () => {
	describe('PostgreSQL Driver Errors', () => {
		test('maps 23505 unique violation with table and column extraction', () => {
			const rawError = {
				code: '23505',
				table: 'users',
				constraint: 'users_email_unique',
				detail: 'Key (email)=(john@example.com) already exists.',
				message: 'duplicate key value violates unique constraint "users_email_unique"',
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(UniqueConstraintError);
			expect(error).toBeInstanceOf(DrizzleConstraintError);
			expect(error).toBeInstanceOf(DrizzleError);
			if (error instanceof UniqueConstraintError) {
				expect(error.type).toBe('unique');
				expect(error.table).toBe('users');
				expect(error.column).toBe('email');
				expect(error.constraint).toBe('users_email_unique');
				expect(error.code).toBe('23505');
				expect(error.detail).toContain('already exists');
			}
		});

		test('maps 23502 not null violation with column extraction', () => {
			const rawError = {
				code: '23502',
				table: 'users',
				column: 'name',
				message: 'null value in column "name" of relation "users" violates not-null constraint',
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(NotNullConstraintError);
			if (error instanceof NotNullConstraintError) {
				expect(error.type).toBe('not_null');
				expect(error.table).toBe('users');
				expect(error.column).toBe('name');
				expect(error.code).toBe('23502');
			}
		});

		test('maps PG 12+ code-less not-null message fallback with relation and column', () => {
			const rawError = new Error('null value in column "username" of relation "accounts" violates not-null constraint');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(NotNullConstraintError);
			if (error instanceof NotNullConstraintError) {
				expect(error.type).toBe('not_null');
				expect(error.table).toBe('accounts');
				expect(error.column).toBe('username');
			}
		});

		test('maps 23503 foreign key violation with detail extraction', () => {
			const rawError = {
				code: '23503',
				constraint: 'orders_user_id_fkey',
				detail: 'Key (user_id)=(999) is not present in table "users".',
				message: 'insert or update on table "orders" violates foreign key constraint "orders_user_id_fkey"',
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(ForeignKeyConstraintError);
			if (error instanceof ForeignKeyConstraintError) {
				expect(error.type).toBe('foreign_key');
				expect(error.table).toBe('users');
				expect(error.column).toBe('user_id');
				expect(error.constraint).toBe('orders_user_id_fkey');
				expect(error.code).toBe('23503');
			}
		});

		test('maps 23514 check constraint violation', () => {
			const rawError = {
				code: '23514',
				constraint: 'users_age_check',
				message: 'new row for relation "users" violates check constraint "users_age_check"',
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(CheckConstraintError);
			if (error instanceof CheckConstraintError) {
				expect(error.type).toBe('check');
				expect(error.constraint).toBe('users_age_check');
				expect(error.code).toBe('23514');
			}
		});
	});

	describe('MySQL Driver Errors', () => {
		test('maps 1062 / ER_DUP_ENTRY duplicate entry', () => {
			const rawError = {
				code: 'ER_DUP_ENTRY',
				errno: 1062,
				message: "Duplicate entry 'test@example.com' for key 'users.email_idx'",
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(UniqueConstraintError);
			if (error instanceof UniqueConstraintError) {
				expect(error.type).toBe('unique');
				expect(error.table).toBe('users');
				expect(error.constraint).toBe('email_idx');
				expect(error.code).toBe('ER_DUP_ENTRY');
			}
		});

		test('maps 1048 / ER_BAD_NULL_ERROR cannot be null', () => {
			const rawError = {
				code: 'ER_BAD_NULL_ERROR',
				errno: 1048,
				message: "Column 'username' cannot be null",
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(NotNullConstraintError);
			if (error instanceof NotNullConstraintError) {
				expect(error.type).toBe('not_null');
				expect(error.column).toBe('username');
				expect(error.code).toBe('ER_BAD_NULL_ERROR');
			}
		});

		test('maps 1452 / ER_NO_REFERENCED_ROW_2 foreign key failure', () => {
			const rawError = {
				code: 'ER_NO_REFERENCED_ROW_2',
				errno: 1452,
				message:
					'Cannot add or update a child row: a foreign key constraint fails (`mydb`.`orders`, CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`))',
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(ForeignKeyConstraintError);
			if (error instanceof ForeignKeyConstraintError) {
				expect(error.type).toBe('foreign_key');
				expect(error.table).toBe('orders');
				expect(error.column).toBe('user_id');
				expect(error.constraint).toBe('fk_orders_user');
			}
		});

		test('maps 3819 / ER_CHECK_CONSTRAINT_VIOLATED', () => {
			const rawError = {
				code: 'ER_CHECK_CONSTRAINT_VIOLATED',
				errno: 3819,
				message: "Check constraint 'chk_positive_price' is violated.",
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(CheckConstraintError);
			if (error instanceof CheckConstraintError) {
				expect(error.type).toBe('check');
				expect(error.constraint).toBe('chk_positive_price');
			}
		});
	});

	describe('SQLite Driver Errors', () => {
		test('maps UNIQUE constraint failed with regex table and column extraction', () => {
			const rawError = new Error('UNIQUE constraint failed: users.email');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(UniqueConstraintError);
			if (error instanceof UniqueConstraintError) {
				expect(error.type).toBe('unique');
				expect(error.table).toBe('users');
				expect(error.column).toBe('email');
			}
		});

		test('maps SQLite multi-column UNIQUE constraint failed', () => {
			const rawError = new Error('UNIQUE constraint failed: accounts.email, accounts.tenant_id');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(UniqueConstraintError);
			if (error instanceof UniqueConstraintError) {
				expect(error.type).toBe('unique');
				expect(error.table).toBe('accounts');
				expect(error.column).toBe('email, tenant_id');
			}
		});

		test('maps NOT NULL constraint failed with regex table and column extraction', () => {
			const rawError = new Error('NOT NULL constraint failed: profiles.avatar_url');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(NotNullConstraintError);
			if (error instanceof NotNullConstraintError) {
				expect(error.type).toBe('not_null');
				expect(error.table).toBe('profiles');
				expect(error.column).toBe('avatar_url');
			}
		});

		test('maps FOREIGN KEY constraint failed', () => {
			const rawError = new Error('FOREIGN KEY constraint failed');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(ForeignKeyConstraintError);
			if (error instanceof ForeignKeyConstraintError) {
				expect(error.type).toBe('foreign_key');
			}
		});

		test('maps CHECK constraint failed', () => {
			const rawError = new Error('CHECK constraint failed: users');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(CheckConstraintError);
			if (error instanceof CheckConstraintError) {
				expect(error.type).toBe('check');
				expect(error.constraint).toBe('users');
			}
		});
	});

	describe('Unknown & Passthrough Errors', () => {
		test('wraps unknown Error as DrizzleError preserving cause', () => {
			const networkErr = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5432');

			const error = mapDriverError(networkErr);

			expect(error).toBeInstanceOf(DrizzleError);
			expect(error).not.toBeInstanceOf(DrizzleConstraintError);
			expect(error.message).toBe('ECONNREFUSED: Connection refused at 127.0.0.1:5432');
			expect(error.cause).toBe(networkErr);
		});

		test('passes through existing DrizzleError instances untouched', () => {
			const existing = new DrizzleError({ message: 'Custom Drizzle error' });

			const mapped = mapDriverError(existing);

			expect(mapped).toBe(existing);
		});
	});

	describe('withDriverErrorMapping wrapper helper', () => {
		test('returns resolved value on successful execution', async () => {
			const result = await withDriverErrorMapping(async () => {
				return { success: true, count: 42 };
			});
			expect(result).toEqual({ success: true, count: 42 });
		});

		test('intercepts and maps driver error into typed DrizzleConstraintError', async () => {
			expect.assertions(3);
			try {
				await withDriverErrorMapping(async () => {
					throw { code: '23505', table: 'users', detail: 'Key (email)=(test@example.com) already exists.' };
				});
			} catch (err) {
				expect(err).toBeInstanceOf(UniqueConstraintError);
				if (err instanceof UniqueConstraintError) {
					expect(err.table).toBe('users');
					expect(err.column).toBe('email');
				}
			}
		});
	});
});
