import { describe, expect, test } from 'vitest';
import {
	DrizzleConstraintError,
	DrizzleError,
	DrizzleForeignKeyConstraintError,
	DrizzleNotNullConstraintError,
	DrizzleQueryError,
	DrizzleUniqueConstraintError,
} from '~/errors.ts';

describe('DrizzleQueryError and constraint error handling (#376)', () => {
	test('classifies PostgreSQL unique violation (code 23505)', () => {
		const pgError = {
			code: '23505',
			constraint: 'users_email_idx',
			table: 'users',
			detail: 'Key (email)=(test@example.com) already exists.',
			message: 'duplicate key value violates unique constraint "users_email_idx"',
		};

		const queryError = new DrizzleQueryError('insert into users values ($1)', ['test@example.com'], pgError as any);

		expect(queryError.code).toBe('23505');
		expect(queryError.constraint).toBe('users_email_idx');
		expect(queryError.constraintType).toBe('unique');
		expect(queryError.table).toBe('users');
		expect(queryError.detail).toBe('Key (email)=(test@example.com) already exists.');

		const constraintErr = queryError.toConstraintError();
		expect(constraintErr).toBeInstanceOf(DrizzleUniqueConstraintError);
		expect(constraintErr).toBeInstanceOf(DrizzleConstraintError);
		expect(constraintErr?.kind).toBe('unique');
		expect(constraintErr?.constraint).toBe('users_email_idx');
	});

	test('classifies MySQL unique duplicate entry (code 1062)', () => {
		const mySqlError = {
			errno: 1062,
			code: 'ER_DUP_ENTRY',
			message: "Duplicate entry 'test@example.com' for key 'users.email_unique'",
		};

		const queryError = new DrizzleQueryError('insert into users values (?)', ['test@example.com'], mySqlError as any);

		expect(queryError.constraintType).toBe('unique');
		const constraintErr = queryError.toConstraintError();
		expect(constraintErr).toBeInstanceOf(DrizzleUniqueConstraintError);
		expect(constraintErr?.kind).toBe('unique');
	});

	test('classifies SQLite UNIQUE constraint violation', () => {
		const sqliteError = {
			code: 'SQLITE_CONSTRAINT_UNIQUE',
			message: 'UNIQUE constraint failed: users.email',
		};

		const queryError = new DrizzleQueryError('insert into users values (?)', ['test@example.com'], sqliteError as any);

		expect(queryError.constraintType).toBe('unique');
		const constraintErr = queryError.toConstraintError();
		expect(constraintErr).toBeInstanceOf(DrizzleUniqueConstraintError);
	});

	test('classifies PostgreSQL foreign key violation (code 23503)', () => {
		const pgFkError = {
			code: '23503',
			constraint: 'posts_user_id_fk',
			table: 'posts',
			detail: 'Key (user_id)=(999) is not present in table "users".',
			message: 'insert or update on table "posts" violates foreign key constraint "posts_user_id_fk"',
		};

		const queryError = new DrizzleQueryError('insert into posts values ($1)', [999], pgFkError as any);

		expect(queryError.constraintType).toBe('foreign_key');
		const constraintErr = queryError.toConstraintError();
		expect(constraintErr).toBeInstanceOf(DrizzleForeignKeyConstraintError);
		expect(constraintErr?.kind).toBe('foreign_key');
		expect(constraintErr?.constraint).toBe('posts_user_id_fk');
	});

	test('classifies PostgreSQL NOT NULL violation (code 23502)', () => {
		const pgNotNullError = {
			code: '23502',
			column: 'email',
			table: 'users',
			message: 'null value in column "email" violates not-null constraint',
		};

		const queryError = new DrizzleQueryError('insert into users values (null)', [], pgNotNullError as any);

		expect(queryError.constraintType).toBe('not_null');
		const constraintErr = queryError.toConstraintError();
		expect(constraintErr).toBeInstanceOf(DrizzleNotNullConstraintError);
		expect(constraintErr?.kind).toBe('not_null');
		expect(constraintErr?.column).toBe('email');
	});

	test('toConstraintError returns undefined for non-constraint errors', () => {
		const syntaxError = {
			code: '42601',
			message: 'syntax error at or near "SELCT"',
		};

		const queryError = new DrizzleQueryError('SELCT 1', [], syntaxError as any);

		expect(queryError.constraintType).toBeUndefined();
		expect(queryError.toConstraintError()).toBeUndefined();
	});
});
