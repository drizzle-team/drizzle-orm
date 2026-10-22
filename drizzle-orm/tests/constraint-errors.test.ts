import { describe, test } from 'vitest';
import {
	DrizzleCheckConstraintError,
	DrizzleConstraintError,
	DrizzleForeignKeyConstraintError,
	DrizzleNotNullConstraintError,
	DrizzleUniqueConstraintError,
	isCheckConstraintError,
	isDrizzleConstraintError,
	isForeignKeyConstraintError,
	isNotNullConstraintError,
	isUniqueConstraintError,
	mapMySqlConstraintError,
	mapPgConstraintError,
	mapSQLiteConstraintError,
} from '~/errors.ts';
import { is } from '~/index.ts';

describe.concurrent('DrizzleConstraintError', () => {
	test('falls back to the driver error message', ({ expect }) => {
		const cause = new Error('duplicate key');
		const error = new DrizzleUniqueConstraintError({ cause });
		expect(error.message).toBe('duplicate key');
		expect(error.constraintType).toBe('unique');
		expect(error.name).toBe('DrizzleUniqueConstraintError');
		expect(error.cause).toBe(cause);
	});

	test('explicit message wins over the driver error message', ({ expect }) => {
		const error = new DrizzleNotNullConstraintError({
			message: 'users.name is required',
			cause: new Error('raw message'),
		});
		expect(error.message).toBe('users.name is required');
	});

	test('defaults when no driver error is available', ({ expect }) => {
		const error = new DrizzleConstraintError({ constraintType: 'unknown' });
		expect(error.message).toBe('A database constraint was violated');
	});

	test('type guards', ({ expect }) => {
		expect(is(new DrizzleUniqueConstraintError({}), DrizzleConstraintError)).toBe(true);
		expect(isUniqueConstraintError(new DrizzleUniqueConstraintError({}))).toBe(true);
		expect(isUniqueConstraintError(new DrizzleNotNullConstraintError({}))).toBe(false);
		expect(isNotNullConstraintError(new DrizzleNotNullConstraintError({}))).toBe(true);
		expect(isForeignKeyConstraintError(new DrizzleForeignKeyConstraintError({}))).toBe(true);
		expect(isCheckConstraintError(new DrizzleCheckConstraintError({}))).toBe(true);
		expect(isDrizzleConstraintError(new Error('plain'))).toBe(false);
	});
});

describe.concurrent('mapPgConstraintError', () => {
	test('node-postgres style unique violation', ({ expect }) => {
		const cause = {
			code: '23505',
			detail: 'Key (email)=(jan@example.com) already exists.',
			table: 'users',
			column: 'email',
			constraint: 'users_email_unique',
		};
		const error = mapPgConstraintError(cause);
		expect(error).instanceOf(DrizzleUniqueConstraintError);
		expect(error?.constraintType).toBe('unique');
		expect(error?.table).toBe('users');
		expect(error?.column).toBe('email');
		expect(error?.constraint).toBe('users_email_unique');
		expect(error?.detail).toBe(cause.detail);
		expect(error?.cause).toBe(cause);
	});

	test('postgres-js style fields (constraint_name/table_name/column_name)', ({ expect }) => {
		const error = mapPgConstraintError({
			code: '23505',
			constraint_name: 'users_email_unique',
			table_name: 'users',
			column_name: 'email',
		});
		expect(error?.table).toBe('users');
		expect(error?.column).toBe('email');
		expect(error?.constraint).toBe('users_email_unique');
	});

	test('unique violation recovers the column from detail', ({ expect }) => {
		const error = mapPgConstraintError({
			code: '23505',
			detail: 'Key (email)=(duplicate@example.com) already exists.',
		});
		expect(isUniqueConstraintError(error)).toBe(true);
		expect(error?.column).toBe('email');
	});

	test('not null violation 23502', ({ expect }) => {
		const error = mapPgConstraintError({
			code: '23502',
			column: 'name',
			table: 'users',
			detail: 'Failing row contains (1, null).',
		});
		expect(isNotNullConstraintError(error)).toBe(true);
		expect(error?.column).toBe('name');
	});

	test('foreign key violation 23503', ({ expect }) => {
		const error = mapPgConstraintError({
			code: '23503',
			detail: 'Key (post_id)=(1) is not present in table "posts".',
			table: 'comments',
			constraint: 'comments_post_id_fkey',
		});
		expect(isForeignKeyConstraintError(error)).toBe(true);
		expect(error?.table).toBe('comments');
		expect(error?.constraint).toBe('comments_post_id_fkey');
	});

	test('check violation 23514', ({ expect }) => {
		const error = mapPgConstraintError({ code: '23514', constraint: 'users_age_positive', table: 'users' });
		expect(isCheckConstraintError(error)).toBe(true);
		expect(error?.constraint).toBe('users_age_positive');
	});

	test('exclusion violation keeps a generic constraint error', ({ expect }) => {
		const error = mapPgConstraintError({ code: '23P01', constraint: 'no_overlapping' });
		expect(isDrizzleConstraintError(error)).toBe(true);
		expect(error?.constraintType).toBe('unknown');
	});

	test('non-constraint errors are not mapped', ({ expect }) => {
		expect(mapPgConstraintError({ code: '22P02' })).toBeUndefined();
		expect(mapPgConstraintError(new Error('plain'))).toBeUndefined();
		expect(mapPgConstraintError(null)).toBeUndefined();
		expect(mapPgConstraintError('string')).toBeUndefined();
	});
});

describe.concurrent('mapMySqlConstraintError', () => {
	test('duplicate entry with schema-qualified key name (MySQL 8)', ({ expect }) => {
		const cause = {
			errno: 1062,
			code: 'ER_DUP_ENTRY',
			sqlState: '23000',
			sqlMessage: "Duplicate entry 'jan@example.com' for key 'users.PRIMARY'",
		};
		const error = mapMySqlConstraintError(cause);
		expect(isUniqueConstraintError(error)).toBe(true);
		expect(error?.table).toBe('users');
		expect(error?.constraint).toBe('PRIMARY');
		expect(error?.code).toBe(1062);
		expect(error?.cause).toBe(cause);
	});

	test('duplicate entry with legacy key name', ({ expect }) => {
		const error = mapMySqlConstraintError({
			errno: 1062,
			sqlMessage: "Duplicate entry 'jan@example.com' for key 'email'",
		});
		expect(isUniqueConstraintError(error)).toBe(true);
		expect(error?.constraint).toBe('email');
		expect(error?.table).toBeUndefined();
	});

	test('null column 1048', ({ expect }) => {
		const error = mapMySqlConstraintError({
			errno: 1048,
			sqlMessage: "Column 'name' cannot be null",
		});
		expect(isNotNullConstraintError(error)).toBe(true);
		expect(error?.column).toBe('name');
	});

	test('foreign key 1451 (delete parent row)', ({ expect }) => {
		const error = mapMySqlConstraintError({
			errno: 1451,
			sqlMessage:
				'Cannot delete or update a parent row: a foreign key constraint fails (`test`.`comments`, CONSTRAINT `comments_post_id` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`))',
		});
		expect(isForeignKeyConstraintError(error)).toBe(true);
		expect(error?.table).toBe('comments');
		expect(error?.constraint).toBe('comments_post_id');
	});

	test('foreign key 1452 (insert child row)', ({ expect }) => {
		const error = mapMySqlConstraintError({
			errno: 1452,
			sqlMessage:
				'Cannot add or update a child row: a foreign key constraint fails (`test`.`comments`, CONSTRAINT `comments_post_id` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`))',
		});
		expect(isForeignKeyConstraintError(error)).toBe(true);
		expect(error?.table).toBe('comments');
	});

	test('check constraint 3819 (MySQL 8)', ({ expect }) => {
		const error = mapMySqlConstraintError({
			errno: 3819,
			sqlMessage: "Check constraint 'users_age_positive' is violated.",
		});
		expect(isCheckConstraintError(error)).toBe(true);
		expect(error?.constraint).toBe('users_age_positive');
	});

	test('check constraint 4025 (MariaDB)', ({ expect }) => {
		const error = mapMySqlConstraintError({
			errno: 4025,
			sqlMessage: 'CONSTRAINT `users_age_positive` failed for `test`.`users`',
		});
		expect(isCheckConstraintError(error)).toBe(true);
		expect(error?.constraint).toBe('users_age_positive');
	});

	test('sqlState fallback when errno is missing', ({ expect }) => {
		const error = mapMySqlConstraintError({ sqlState: '23000', message: 'integrity constraint violation' });
		expect(isDrizzleConstraintError(error)).toBe(true);
		expect(error?.constraintType).toBe('unknown');
		expect(error?.code).toBe('23000');
	});

	test('non-constraint errors are not mapped', ({ expect }) => {
		expect(mapMySqlConstraintError({ errno: 1146, sqlMessage: "Table 'test.missing' doesn't exist" }))
			.toBeUndefined();
		expect(mapMySqlConstraintError({ errno: 1054, sqlMessage: "Unknown column 'x' in 'where clause'" }))
			.toBeUndefined();
	});
});

describe.concurrent('mapSQLiteConstraintError', () => {
	test('better-sqlite3 unique violation', ({ expect }) => {
		const cause = { code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'UNIQUE constraint failed: users.email' };
		const error = mapSQLiteConstraintError(cause);
		expect(isUniqueConstraintError(error)).toBe(true);
		expect(error?.table).toBe('users');
		expect(error?.column).toBe('email');
		expect(error?.cause).toBe(cause);
	});

	test('composite unique violation', ({ expect }) => {
		const error = mapSQLiteConstraintError({
			code: 'SQLITE_CONSTRAINT_UNIQUE',
			message: 'UNIQUE constraint failed: users.first_name, users.last_name',
		});
		expect(isUniqueConstraintError(error)).toBe(true);
		expect(error?.table).toBe('users');
		expect(error?.column).toBe('first_name');
	});

	test('primary key family maps to unique', ({ expect }) => {
		const error = mapSQLiteConstraintError({
			code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
			message: 'UNIQUE constraint failed: users.id',
		});
		expect(isUniqueConstraintError(error)).toBe(true);
	});

	test('not null violation', ({ expect }) => {
		const error = mapSQLiteConstraintError({
			code: 'SQLITE_CONSTRAINT_NOTNULL',
			message: 'NOT NULL constraint failed: users.name',
		});
		expect(isNotNullConstraintError(error)).toBe(true);
		expect(error?.table).toBe('users');
		expect(error?.column).toBe('name');
	});

	test('foreign key violation', ({ expect }) => {
		const error = mapSQLiteConstraintError({
			code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
			message: 'FOREIGN KEY constraint failed',
		});
		expect(isForeignKeyConstraintError(error)).toBe(true);
	});

	test('check violation with constraint name', ({ expect }) => {
		const error = mapSQLiteConstraintError({
			code: 'SQLITE_CONSTRAINT_CHECK',
			message: 'CHECK constraint failed: users_age_positive',
		});
		expect(isCheckConstraintError(error)).toBe(true);
		expect(error?.constraint).toBe('users_age_positive');
	});

	test('libsql style generic SQLITE_CONSTRAINT code is derived from the message', ({ expect }) => {
		const error = mapSQLiteConstraintError({
			code: 'SQLITE_CONSTRAINT',
			message: 'NOT NULL constraint failed: users.name',
		});
		expect(isNotNullConstraintError(error)).toBe(true);
		expect(error?.column).toBe('name');
	});

	test('message-only errors (bun:sqlite / node:sqlite) are derived from the message', ({ expect }) => {
		const error = mapSQLiteConstraintError(new Error('UNIQUE constraint failed: users.email'));
		expect(isUniqueConstraintError(error)).toBe(true);
		expect(error?.table).toBe('users');
	});

	test('non-constraint errors are not mapped', ({ expect }) => {
		expect(mapSQLiteConstraintError({ code: 'SQLITE_MISUSE', message: 'bad parameter' })).toBeUndefined();
		expect(mapSQLiteConstraintError(new Error('cannot start a transaction within a transaction')))
			.toBeUndefined();
	});

	test('unknown SQLITE_CONSTRAINT family keeps a generic constraint error', ({ expect }) => {
		const error = mapSQLiteConstraintError({ code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'boom' });
		expect(isDrizzleConstraintError(error)).toBe(true);
		expect(error?.constraintType).toBe('unknown');
	});
});
