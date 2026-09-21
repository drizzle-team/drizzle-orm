import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';

/**
 * SQLite result codes. Includes the extended `SQLITE_CONSTRAINT_*` codes that
 * drivers such as `better-sqlite3`, `bun:sqlite`, `libsql` and `node:sqlite`
 * report for integrity constraint violations.
 *
 * @example `SQLITE_ERROR.CONSTRAINT_UNIQUE === 2067`
 */
export const SQLITE_ERROR = {
	// Primary result codes
	OK: 0,
	ERROR: 1,
	INTERNAL: 2,
	PERM: 3,
	ABORT: 4,
	BUSY: 5,
	LOCKED: 6,
	NOMEM: 7,
	READONLY: 8,
	INTERRUPT: 9,
	IOERR: 10,
	CORRUPT: 11,
	NOTFOUND: 12,
	FULL: 13,
	CANTOPEN: 14,
	PROTOCOL: 15,
	EMPTY: 16,
	SCHEMA: 17,
	TOOBIG: 18,
	CONSTRAINT: 19,
	MISMATCH: 20,
	MISUSE: 21,
	NOLFS: 22,
	AUTH: 23,
	FORMAT: 24,
	RANGE: 25,
	NOTADB: 26,
	NOTICE: 27,
	WARNING: 28,
	ROW: 100,
	DONE: 101,
	// Extended result codes for constraint violations
	CONSTRAINT_CHECK: 275,
	CONSTRAINT_COMMITHOOK: 531,
	CONSTRAINT_FOREIGNKEY: 787,
	CONSTRAINT_FUNCTION: 1043,
	CONSTRAINT_NOTNULL: 1299,
	CONSTRAINT_PRIMARYKEY: 1555,
	CONSTRAINT_TRIGGER: 1811,
	CONSTRAINT_UNIQUE: 2067,
	CONSTRAINT_VTAB: 2323,
	CONSTRAINT_ROWID: 2579,
	CONSTRAINT_PINNED: 2835,
	CONSTRAINT_DATATYPE: 3091,
} as const;

export type SQLiteConstraintType = 'unique' | 'not_null' | 'foreign_key' | 'check' | 'primary_key';

const sqliteConstraintTypes: Record<number, SQLiteConstraintType> = {
	[SQLITE_ERROR.CONSTRAINT_UNIQUE]: 'unique',
	[SQLITE_ERROR.CONSTRAINT_NOTNULL]: 'not_null',
	[SQLITE_ERROR.CONSTRAINT_FOREIGNKEY]: 'foreign_key',
	[SQLITE_ERROR.CONSTRAINT_CHECK]: 'check',
	[SQLITE_ERROR.CONSTRAINT_PRIMARYKEY]: 'primary_key',
};

const sqliteConstraintNames: Record<string, SQLiteConstraintType> = {
	SQLITE_CONSTRAINT_UNIQUE: 'unique',
	SQLITE_CONSTRAINT_NOTNULL: 'not_null',
	SQLITE_CONSTRAINT_FOREIGNKEY: 'foreign_key',
	SQLITE_CONSTRAINT_CHECK: 'check',
	SQLITE_CONSTRAINT_PRIMARYKEY: 'primary_key',
};

interface SQLiteDriverError extends Error {
	code?: string | number;
	errno?: number;
	// node:sqlite
	errcode?: number;
	errstr?: string;
	// libsql
	rawCode?: number;
}

/**
 * `DrizzleQueryError` carrying the SQLite error report surfaced by drivers such
 * as `better-sqlite3`, `bun:sqlite`, `libsql`, `node:sqlite`, `d1`, `op-sqlite`
 * or `expo-sqlite`.
 *
 * The original driver error is preserved on {@link DrizzleQueryError.cause}.
 *
 * @example
 * ```ts
 * import { is } from 'drizzle-orm';
 * import { SQLITE_ERROR, SQLiteQueryError } from 'drizzle-orm/sqlite-core';
 *
 * try {
 * 	await db.insert(users).values({ email });
 * } catch (e) {
 * 	if (is(e, SQLiteQueryError) && e.constraintType === 'unique') {
 * 		// e.tableName, e.columnNames, ...
 * 	}
 * }
 * ```
 */
export class SQLiteQueryError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'SQLiteQueryError';

	/**
	 * Driver-reported result code: a `SQLITE_*` name (`better-sqlite3`,
	 * `bun:sqlite`, `libsql`) or a numeric result code
	 * (compare against {@link SQLITE_ERROR}).
	 */
	readonly code?: string | number;
	/** Numeric result code, when the driver reports one. */
	readonly errno?: number;
	readonly errcode?: number;
	readonly errstr?: string;

	/**
	 * The kind of integrity constraint that was violated, when the driver
	 * report identifies one. `undefined` for any other error.
	 */
	readonly constraintType?: SQLiteConstraintType;

	/** Constraint name extracted from the error message, when reported. */
	readonly constraintName?: string;
	/** Table name extracted from the error message, when reported. */
	readonly tableName?: string;
	/**
	 * Column names extracted from the error message, when reported
	 * (e.g. `UNIQUE constraint failed: users.email`).
	 */
	readonly columnNames: string[];

	constructor(query: string, params: any[], cause: SQLiteDriverError) {
		super(query, params, cause);
		this.name = 'SQLiteQueryError';
		Error.captureStackTrace(this, SQLiteQueryError);

		this.code = cause.code;
		this.errno = cause.errno ?? cause.rawCode;
		this.errcode = cause.errcode;
		this.errstr = cause.errstr;

		const parsed = parseSQLiteMessage(cause.message);
		this.constraintType = classifySQLiteError(cause, parsed.constraintType);
		this.constraintName = parsed.constraintName;
		this.tableName = parsed.tableName;
		this.columnNames = parsed.columnNames;
	}
}

/** @internal */
export function isSQLiteDriverError(error: unknown): error is SQLiteDriverError {
	if (typeof error !== 'object' || error === null) {
		return false;
	}
	const { code, errno, errcode, errstr, rawCode, message } = error as SQLiteDriverError;

	if (typeof code === 'string' && code.startsWith('SQLITE_')) {
		return true;
	}
	if (typeof code === 'number') {
		return true;
	}
	if (typeof errcode === 'number' && typeof errstr === 'string') {
		return true;
	}
	if (typeof errno === 'number' || typeof rawCode === 'number') {
		return true;
	}
	// drivers that surface the bare sqlite message text only (d1, sql.js, expo-sqlite)
	return typeof message === 'string' && sqliteMessageConstraint.test(message);
}

/** @internal */
export function wrapSQLiteQueryError(query: string, params: any[], error: unknown): DrizzleQueryError {
	return isSQLiteDriverError(error)
		? new SQLiteQueryError(query, params, error)
		: new DrizzleQueryError(query, params, error as Error);
}

// the target is a comma-separated list of `table.column`/`column` references
// or a bare constraint name (CHECK violations); some drivers append extra
// context after it (e.g. d1's `: SQLITE_CONSTRAINT`), so the list is matched
// strictly and trailing non-identifier text is ignored
const sqliteMessageConstraint = new RegExp(
	'(UNIQUE|NOT NULL|CHECK|FOREIGN KEY|PRIMARY KEY|DATATYPE) constraint failed'
		+ `(?::\\s*((?:[\\w$"]+\\.)*[\\w$"]+(?:\\s*,\\s*(?:[\\w$"]+\\.)*[\\w$"]+)*))?`,
	'i',
);

const sqliteMessageTypes: Record<string, SQLiteConstraintType> = {
	UNIQUE: 'unique',
	'NOT NULL': 'not_null',
	CHECK: 'check',
	'FOREIGN KEY': 'foreign_key',
	'PRIMARY KEY': 'primary_key',
	DATATYPE: 'check',
};

// SQLite reports the offending values as `UNIQUE constraint failed: t.col` or
// `t.c1, t.c2` for composite keys. CHECK violations report the constraint name
// instead. Some drivers expose no machine-readable fields at all, so the
// canonical message text is the only reliable source for them.
function parseSQLiteMessage(
	message: string | undefined,
): {
	constraintType?: SQLiteConstraintType;
	constraintName?: string;
	tableName?: string;
	columnNames: string[];
} {
	const result: {
		constraintType?: SQLiteConstraintType;
		constraintName?: string;
		tableName?: string;
		columnNames: string[];
	} = { columnNames: [] };
	if (message === undefined) {
		return result;
	}

	const match = sqliteMessageConstraint.exec(message);
	if (match === null) {
		return result;
	}
	result.constraintType = sqliteMessageTypes[match[1]!.toUpperCase()];

	const target = match[2]?.trim();
	if (target === undefined || target === '') {
		return result;
	}

	if (result.constraintType === 'check') {
		// `CHECK constraint failed: chk_name`
		result.constraintName = target;
		return result;
	}

	for (const ref of target.split(',')) {
		const parts = ref.trim().split('.');
		if (parts.length === 1) {
			result.columnNames.push(parts[0]!);
		} else {
			result.tableName ??= parts.at(-2);
			result.columnNames.push(parts.at(-1)!);
		}
	}
	return result;
}

function classifySQLiteError(
	error: SQLiteDriverError,
	fromMessage: SQLiteConstraintType | undefined,
): SQLiteConstraintType | undefined {
	const code = error.code ?? error.errcode ?? error.errno ?? error.rawCode;
	if (typeof code === 'number' && sqliteConstraintTypes[code] !== undefined) {
		return sqliteConstraintTypes[code];
	}
	if (typeof code === 'string' && sqliteConstraintNames[code] !== undefined) {
		return sqliteConstraintNames[code];
	}
	return fromMessage;
}
