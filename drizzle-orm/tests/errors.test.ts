import { describe, expect, test } from 'vitest';
import {
	CheckConstraintError,
	ConstraintErrorType,
	DrizzleConstraintError,
	DrizzleError,
	DrizzleQueryError,
	ForeignKeyConstraintError,
	isCheckConstraintError,
	isConstraintError,
	isDrizzleError,
	isForeignKeyConstraintError,
	isNotNullConstraintError,
	isQueryError,
	isUniqueConstraintError,
	mapDriverError,
	NotNullConstraintError,
	UniqueConstraintError,
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

		test('maps 23503 foreign key violation with detail extraction', () => {
			const rawError = {
				code: '23503',
				constraint: 'orders_user_id_users_id_fk',
				detail: 'Key (user_id)=(999) is not present in table "users".',
				message: 'insert or update on table "orders" violates foreign key constraint "orders_user_id_users_id_fk"',
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(ForeignKeyConstraintError);
			if (error instanceof ForeignKeyConstraintError) {
				expect(error.type).toBe('foreign_key');
				expect(error.table).toBe('users');
				expect(error.column).toBe('user_id');
				expect(error.constraint).toBe('orders_user_id_users_id_fk');
				expect(error.code).toBe('23503');
			}
		});

		test('maps 23514 check constraint violation', () => {
			const rawError = {
				code: '23514',
				table: 'users',
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
		test('maps 1062 ER_DUP_ENTRY unique violation', () => {
			const rawError = {
				code: 'ER_DUP_ENTRY',
				errno: 1062,
				message: "Duplicate entry 'test@example.com' for key 'users.email_unique'",
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(UniqueConstraintError);
			if (error instanceof UniqueConstraintError) {
				expect(error.type).toBe('unique');
				expect(error.table).toBe('users');
				expect(error.constraint).toBe('email_unique');
				expect(error.code).toBe('ER_DUP_ENTRY');
			}
		});

		test('maps 1048 ER_BAD_NULL_ERROR not null violation', () => {
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
			}
		});

		test('maps 1452 ER_NO_REFERENCED_ROW_2 foreign key violation', () => {
			const rawError = {
				code: 'ER_NO_REFERENCED_ROW_2',
				errno: 1452,
				message:
					'Cannot add or update a child row: a foreign key constraint fails (`mydb`.`orders`, CONSTRAINT `fk_order_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`))',
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(ForeignKeyConstraintError);
			if (error instanceof ForeignKeyConstraintError) {
				expect(error.type).toBe('foreign_key');
				expect(error.table).toBe('orders');
				expect(error.constraint).toBe('fk_order_user');
				expect(error.column).toBe('user_id');
			}
		});

		test('maps 3819 ER_CHECK_CONSTRAINT_VIOLATED check violation', () => {
			const rawError = {
				code: 'ER_CHECK_CONSTRAINT_VIOLATED',
				errno: 3819,
				message: "Check constraint 'check_min_age' is violated.",
			};

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(CheckConstraintError);
			if (error instanceof CheckConstraintError) {
				expect(error.type).toBe('check');
				expect(error.constraint).toBe('check_min_age');
			}
		});
	});

	describe('SQLite Driver Errors', () => {
		test('maps UNIQUE constraint failed with table and column', () => {
			const rawError = new Error('UNIQUE constraint failed: users.email');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(UniqueConstraintError);
			if (error instanceof UniqueConstraintError) {
				expect(error.type).toBe('unique');
				expect(error.table).toBe('users');
				expect(error.column).toBe('email');
			}
		});

		test('maps NOT NULL constraint failed with table and column', () => {
			const rawError = new Error('NOT NULL constraint failed: users.age');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(NotNullConstraintError);
			if (error instanceof NotNullConstraintError) {
				expect(error.type).toBe('not_null');
				expect(error.table).toBe('users');
				expect(error.column).toBe('age');
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
			const rawError = new Error('CHECK constraint failed: age >= 18');

			const error = mapDriverError(rawError);

			expect(error).toBeInstanceOf(CheckConstraintError);
			if (error instanceof CheckConstraintError) {
				expect(error.type).toBe('check');
				expect(error.constraint).toBe('age >= 18');
			}
		});
	});

	describe('DrizzleQueryError Integration & Wrapping', () => {
		test('automatically attaches mapped constraint to DrizzleQueryError', () => {
			const rawPgError = {
				code: '23505',
				table: 'users',
				constraint: 'users_email_key',
				detail: 'Key (email)=(dup@test.com) already exists.',
				message: 'duplicate key value violates unique constraint "users_email_key"',
			};

			const queryError = new DrizzleQueryError('INSERT INTO "users" ...', ['dup@test.com'], rawPgError);

			expect(queryError).toBeInstanceOf(DrizzleError);
			expect(queryError.constraint).toBeInstanceOf(UniqueConstraintError);
			expect(queryError.constraint?.table).toBe('users');
			expect(queryError.constraint?.column).toBe('email');
			expect(queryError.constraint?.constraint).toBe('users_email_key');
		});
	});

	describe('Type Guards', () => {
		test('isDrizzleError correctly identifies DrizzleError instances', () => {
			expect(isDrizzleError(new DrizzleError({ message: 'test' }))).toBe(true);
			expect(isDrizzleError(new UniqueConstraintError({ message: 'unique' }))).toBe(true);
			expect(isDrizzleError(new DrizzleQueryError('SELECT 1', []))).toBe(true);
			expect(isDrizzleError(new Error('generic'))).toBe(false);
			expect(isDrizzleError(null)).toBe(false);
		});

		test('isQueryError correctly identifies DrizzleQueryError instances', () => {
			const qError = new DrizzleQueryError('SELECT 1', []);
			expect(isQueryError(qError)).toBe(true);
			expect(isQueryError(new DrizzleError({ message: 'test' }))).toBe(false);
		});

		test('isUniqueConstraintError identifies direct and wrapped errors', () => {
			const direct = new UniqueConstraintError({ message: 'duplicate', table: 'users', column: 'email' });
			const rawPgError = {
				code: '23505',
				table: 'users',
				detail: 'Key (email)=(test) already exists.',
				message: 'duplicate key value violates unique constraint "users_email_key"',
			};
			const wrapped = new DrizzleQueryError('INSERT ...', [], rawPgError);
			const notNull = new NotNullConstraintError({ message: 'null value' });

			expect(isUniqueConstraintError(direct)).toBe(true);
			expect(isUniqueConstraintError(wrapped)).toBe(true);
			expect(isUniqueConstraintError(notNull)).toBe(false);
			expect(isUniqueConstraintError(new Error('foo'))).toBe(false);
		});

		test('isNotNullConstraintError identifies direct and wrapped errors', () => {
			const direct = new NotNullConstraintError({ message: 'not null' });
			const wrapped = new DrizzleQueryError('INSERT ...', [], { code: '23502', column: 'name' });

			expect(isNotNullConstraintError(direct)).toBe(true);
			expect(isNotNullConstraintError(wrapped)).toBe(true);
			expect(isNotNullConstraintError(new UniqueConstraintError({ message: 'u' }))).toBe(false);
		});

		test('isForeignKeyConstraintError identifies direct and wrapped errors', () => {
			const direct = new ForeignKeyConstraintError({ message: 'fk failed' });
			const wrapped = new DrizzleQueryError('INSERT ...', [], { code: '23503' });

			expect(isForeignKeyConstraintError(direct)).toBe(true);
			expect(isForeignKeyConstraintError(wrapped)).toBe(true);
		});

		test('isCheckConstraintError identifies direct and wrapped errors', () => {
			const direct = new CheckConstraintError({ message: 'check failed' });
			const wrapped = new DrizzleQueryError('INSERT ...', [], { code: '23514' });

			expect(isCheckConstraintError(direct)).toBe(true);
			expect(isCheckConstraintError(wrapped)).toBe(true);
		});

		test('isConstraintError matches any constraint error', () => {
			expect(isConstraintError(new UniqueConstraintError({ message: 'u' }))).toBe(true);
			expect(isConstraintError(new NotNullConstraintError({ message: 'n' }))).toBe(true);
			expect(isConstraintError(new ForeignKeyConstraintError({ message: 'f' }))).toBe(true);
			expect(isConstraintError(new CheckConstraintError({ message: 'c' }))).toBe(true);
			expect(isConstraintError(new DrizzleQueryError('SELECT 1', [], { code: '23505' }))).toBe(true);
			expect(isConstraintError(new DrizzleQueryError('SELECT 1', [], new Error('syntax error')))).toBe(false);
		});
	});
});
