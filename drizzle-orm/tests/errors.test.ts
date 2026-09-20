import { describe, expect, test } from 'vitest';
import { DrizzleQueryError, is } from '~/index.ts';
import { MYSQL_ERROR, MySqlQueryError, wrapMySqlQueryError } from '~/mysql-core/errors.ts';
import { PG_ERROR, PgQueryError, wrapPgQueryError } from '~/pg-core/errors.ts';
import { SQLITE_ERROR, SQLiteQueryError, wrapSQLiteQueryError } from '~/sqlite-core/errors.ts';

const query = 'insert into "users" ("email") values ($1)';
const params = ['dup@example.com'];

function nodePgError(overrides: Record<string, unknown> = {}) {
	return Object.assign(new Error('duplicate key value violates unique constraint "users_email_index"'), {
		severity: 'ERROR',
		code: '23505',
		detail: 'Key (email)=(dup@example.com) already exists.',
		hint: undefined,
		position: undefined,
		schema: 'public',
		table: 'users',
		constraint: 'users_email_index',
		routine: '_bt_check_unique',
		...overrides,
	});
}

describe('PgQueryError', () => {
	test('wraps node-postgres shaped errors with all fields', () => {
		const err = wrapPgQueryError(query, params, nodePgError());
		expect(is(err, PgQueryError)).toBe(true);
		expect(is(err, DrizzleQueryError)).toBe(true);
		const pgErr = err as PgQueryError;
		expect(pgErr.code).toBe(PG_ERROR.INTEGRITY_CONSTRAINT_VIOLATION.UNIQUE_VIOLATION);
		expect(pgErr.constraintType).toBe('unique');
		expect(pgErr.constraintName).toBe('users_email_index');
		expect(pgErr.tableName).toBe('users');
		expect(pgErr.schemaName).toBe('public');
		expect(pgErr.severity).toBe('ERROR');
		expect(pgErr.detail).toBe('Key (email)=(dup@example.com) already exists.');
		expect(pgErr.columnNames).toEqual(['email']);
		expect(pgErr.query).toBe(query);
		expect(pgErr.params).toEqual(params);
		expect(pgErr.cause).toBeInstanceOf(Error);
		expect(pgErr.message).toContain('Failed query:');
	});

	test('normalizes postgres.js snake_case fields', () => {
		const err = wrapPgQueryError(query, params, {
			name: 'PostgresError',
			message: 'null value in column "name" of relation "users" violates not-null constraint',
			severity_local: 'ERROR',
			severity: 'ERROR',
			code: '23502',
			schema_name: 'public',
			table_name: 'users',
			column_name: 'name',
			constraint_name: undefined,
			internal_query: 'insert ...',
			stack: '',
		});
		expect(is(err, PgQueryError)).toBe(true);
		const pgErr = err as PgQueryError;
		expect(pgErr.constraintType).toBe('not_null');
		expect(pgErr.tableName).toBe('users');
		expect(pgErr.columnName).toBe('name');
		expect(pgErr.schemaName).toBe('public');
		expect(pgErr.severityLocal).toBe('ERROR');
		expect(pgErr.internalQuery).toBe('insert ...');
	});

	test('extracts composite and quoted key columns from detail', () => {
		const err = wrapPgQueryError(
			query,
			params,
			nodePgError({
				detail: 'Key (a, "weird,col", b)=(1, 2, 3) already exists.',
				code: '23505',
			}),
		) as PgQueryError;
		expect(err.columnNames).toEqual(['a', 'weird,col', 'b']);
	});

	test('classifies remaining class-23 codes', () => {
		for (
			const [code, type] of [
				['23503', 'foreign_key'],
				['23514', 'check'],
				['23P01', 'exclusion'],
				['23001', undefined],
			] as const
		) {
			const err = wrapPgQueryError(query, params, nodePgError({ code, detail: undefined }));
			expect(is(err, PgQueryError)).toBe(true);
			expect((err as PgQueryError).constraintType).toBe(type);
		}
	});

	test('non-constraint sqlstate stays typed but unclassified', () => {
		// invalid_text_representation — e.g. malformed uuid
		const err = wrapPgQueryError(
			query,
			params,
			nodePgError({
				code: '22P02',
				message: 'invalid input syntax for type uuid: "x"',
				constraint: undefined,
				detail: undefined,
			}),
		);
		expect(is(err, PgQueryError)).toBe(true);
		const pgErr = err as PgQueryError;
		expect(pgErr.code).toBe(PG_ERROR.DATA_EXCEPTION.INVALID_TEXT_REPRESENTATION);
		expect(pgErr.constraintType).toBeUndefined();
	});

	test('unrecognized errors fall back to DrizzleQueryError', () => {
		for (
			const e of [
				new Error('socket hangup'),
				Object.assign(new Error('conn refused'), { code: 'ECONNREFUSED' }),
				Object.assign(new Error('looks close'), { code: '23505' }), // no severity
				'not an object',
			]
		) {
			const err = wrapPgQueryError(query, params, e);
			expect(is(err, PgQueryError)).toBe(false);
			expect(is(err, DrizzleQueryError)).toBe(true);
			expect(err.query).toBe(query);
		}
	});
});

describe('MySqlQueryError', () => {
	function mysqlError(overrides: Record<string, unknown> = {}) {
		return Object.assign(new Error("Duplicate entry 'dup@example.com' for key 'users.email'"), {
			code: 'ER_DUP_ENTRY',
			errno: 1062,
			sqlState: '23000',
			sqlMessage: "Duplicate entry 'dup@example.com' for key 'users.email'",
			fatal: false,
			...overrides,
		});
	}

	test('wraps mysql2 shaped errors', () => {
		const err = wrapMySqlQueryError(query, params, mysqlError());
		expect(is(err, MySqlQueryError)).toBe(true);
		expect(is(err, DrizzleQueryError)).toBe(true);
		const myErr = err as MySqlQueryError;
		expect(myErr.errno).toBe(MYSQL_ERROR.DUP_ENTRY);
		expect(myErr.code).toBe('ER_DUP_ENTRY');
		expect(myErr.sqlState).toBe('23000');
		expect(myErr.constraintType).toBe('unique');
		expect(myErr.constraintName).toBe('email');
		expect(myErr.tableName).toBe('users');
		expect(myErr.cause).toBeInstanceOf(Error);
	});

	test('parses foreign key constraint details', () => {
		const err = wrapMySqlQueryError(
			query,
			params,
			mysqlError({
				errno: 1452,
				code: 'ER_NO_REFERENCED_ROW_2',
				sqlMessage:
					'Cannot add or update a child row: a foreign key constraint fails (`app`.`orders`, CONSTRAINT `orders_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`))',
				message:
					'Cannot add or update a child row: a foreign key constraint fails (`app`.`orders`, CONSTRAINT `orders_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`))',
			}),
		) as MySqlQueryError;
		expect(err.constraintType).toBe('foreign_key');
		expect(err.constraintName).toBe('orders_user_fk');
		expect(err.tableName).toBe('orders');
		expect(err.columnNames).toEqual(['user_id']);
	});

	test('parses not-null and check violations', () => {
		const nn = wrapMySqlQueryError(
			query,
			params,
			mysqlError({
				errno: 1048,
				code: 'ER_BAD_NULL_ERROR',
				sqlMessage: "Column 'email' cannot be null",
				message: "Column 'email' cannot be null",
			}),
		) as MySqlQueryError;
		expect(nn.constraintType).toBe('not_null');
		expect(nn.columnNames).toEqual(['email']);

		const chk = wrapMySqlQueryError(
			query,
			params,
			mysqlError({
				errno: 3819,
				code: 'ER_CHECK_CONSTRAINT_VIOLATED',
				sqlMessage: "Check constraint 'email_chk' is violated.",
				message: "Check constraint 'email_chk' is violated.",
			}),
		) as MySqlQueryError;
		expect(chk.constraintType).toBe('check');
		expect(chk.constraintName).toBe('email_chk');
	});

	test('parses MariaDB CONSTRAINT failed messages', () => {
		const err = wrapMySqlQueryError(
			query,
			params,
			mysqlError({
				errno: 4025,
				code: 'ER_CONSTRAINT_FAILED',
				sqlMessage: 'CONSTRAINT `users_email` failed for `app`.`users`',
				message: 'CONSTRAINT `users_email` failed for `app`.`users`',
			}),
		) as MySqlQueryError;
		expect(err.constraintType).toBe('check');
		expect(err.constraintName).toBe('users_email');
		expect(err.tableName).toBe('users');
	});

	test('unrecognized errors fall back to DrizzleQueryError', () => {
		for (const e of [new Error('boom'), Object.assign(new Error('x'), { code: 'PROTOCOL_CONNECTION_LOST' })]) {
			const err = wrapMySqlQueryError(query, params, e);
			expect(is(err, MySqlQueryError)).toBe(false);
			expect(is(err, DrizzleQueryError)).toBe(true);
		}
	});
});

describe('SQLiteQueryError', () => {
	test('wraps better-sqlite3 shaped errors', () => {
		const err = wrapSQLiteQueryError(
			query,
			params,
			Object.assign(new Error('UNIQUE constraint failed: users.email'), {
				code: 'SQLITE_CONSTRAINT_UNIQUE',
			}),
		);
		expect(is(err, SQLiteQueryError)).toBe(true);
		expect(is(err, DrizzleQueryError)).toBe(true);
		const liteErr = err as SQLiteQueryError;
		expect(liteErr.code).toBe('SQLITE_CONSTRAINT_UNIQUE');
		expect(liteErr.constraintType).toBe('unique');
		expect(liteErr.tableName).toBe('users');
		expect(liteErr.columnNames).toEqual(['email']);
	});

	test('numeric extended codes classify the same', () => {
		const err = wrapSQLiteQueryError(
			query,
			params,
			Object.assign(new Error('UNIQUE constraint failed: users.email'), {
				code: SQLITE_ERROR.CONSTRAINT_UNIQUE,
				errno: 2067,
			}),
		) as SQLiteQueryError;
		expect(err.constraintType).toBe('unique');
		expect(err.errno).toBe(2067);
	});

	test('node:sqlite errcode/errstr shape', () => {
		const err = wrapSQLiteQueryError(
			query,
			params,
			Object.assign(new Error('NOT NULL constraint failed: users.name'), {
				errcode: 1299,
				errstr: 'SQLITE_CONSTRAINT_NOTNULL',
			}),
		) as SQLiteQueryError;
		expect(is(err, SQLiteQueryError)).toBe(true);
		expect(err.constraintType).toBe('not_null');
		expect(err.columnNames).toEqual(['name']);
	});

	test('message-only drivers (d1/sql.js) classify via message', () => {
		const err = wrapSQLiteQueryError(
			query,
			params,
			new Error('D1_ERROR: UNIQUE constraint failed: users.a, users.b: SQLITE_CONSTRAINT'),
		) as SQLiteQueryError;
		expect(is(err, SQLiteQueryError)).toBe(true);
		expect(err.constraintType).toBe('unique');
		expect(err.tableName).toBe('users');
		expect(err.columnNames).toEqual(['a', 'b']);
	});

	test('check violations expose constraint name', () => {
		const err = wrapSQLiteQueryError(
			query,
			params,
			Object.assign(new Error('CHECK constraint failed: email_chk'), {
				code: 'SQLITE_CONSTRAINT_CHECK',
			}),
		) as SQLiteQueryError;
		expect(err.constraintType).toBe('check');
		expect(err.constraintName).toBe('email_chk');
	});

	test('foreign key and non-constraint errors', () => {
		const fk = wrapSQLiteQueryError(
			query,
			params,
			Object.assign(new Error('FOREIGN KEY constraint failed'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
		) as SQLiteQueryError;
		expect(fk.constraintType).toBe('foreign_key');

		const busy = wrapSQLiteQueryError(
			query,
			params,
			Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }),
		) as SQLiteQueryError;
		expect(is(busy, SQLiteQueryError)).toBe(true);
		expect(busy.constraintType).toBeUndefined();
	});

	test('unrecognized errors fall back to DrizzleQueryError', () => {
		for (const e of [new Error('boom'), Object.assign(new Error('x'), { code: 'ENOENT' })]) {
			const err = wrapSQLiteQueryError(query, params, e);
			expect(is(err, SQLiteQueryError)).toBe(false);
			expect(is(err, DrizzleQueryError)).toBe(true);
		}
	});
});
