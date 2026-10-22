import { entityKind, is } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export class DrizzleQueryError extends Error {
	constructor(
		public query: string,
		public params: any[],
		public override cause?: Error,
	) {
		super(`Failed query: ${query}\nparams: ${params}`);
		Error.captureStackTrace(this, DrizzleQueryError);

		// ES2022+: preserves original error on `.cause`
		if (cause) (this as any).cause = cause;
	}
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}

/** Kind of a database constraint that was violated by a query. */
export type DrizzleConstraintType = 'unique' | 'not_null' | 'foreign_key' | 'check' | 'unknown';

export interface DrizzleConstraintErrorParams {
	/** Human readable description, defaults to the message of the underlying driver error when available */
	message?: string;
	/** Native driver error (pg DatabaseError, mysql2/SQLite error, ...), preserved unmodified */
	cause?: unknown;
	/** Type of the violated constraint */
	constraintType: DrizzleConstraintType;
	/** Driver error code, e.g. PostgreSQL SQLSTATE `23505`, MySQL errno `1062` or SQLite `SQLITE_CONSTRAINT_UNIQUE` */
	code?: string | number;
	/** Database table the error was raised for */
	table?: string;
	/** Database column the error was raised for, if known */
	column?: string;
	/** Name of the violated constraint, if reported by the driver */
	constraint?: string;
	/** Driver-provided details, e.g. `Key (email)=(...) already exists.` */
	detail?: string;
}

/**
 * Thrown (as the `cause` of a {@link DrizzleQueryError}) when a query violated a database constraint.
 *
 * Use the type guards (`isUniqueConstraintError`, ...) or check `constraintType` to handle specific
 * constraint violations. The originating driver error stays available on `.cause`.
 */
export class DrizzleConstraintError extends DrizzleError {
	static override readonly [entityKind]: string = 'DrizzleConstraintError';

	readonly constraintType: DrizzleConstraintType;
	readonly code?: string | number;
	readonly table?: string;
	readonly column?: string;
	readonly constraint?: string;
	readonly detail?: string;

	constructor(params: DrizzleConstraintErrorParams) {
		const { message, cause, constraintType, code, table, column, constraint, detail } = params;
		const mappedMessage = message
			?? (cause instanceof Error ? cause.message : undefined)
			?? 'A database constraint was violated';
		super({ message: mappedMessage, cause });
		this.name = 'DrizzleConstraintError';
		this.constraintType = constraintType;
		this.code = code;
		this.table = table;
		this.column = column;
		this.constraint = constraint;
		this.detail = detail;
	}
}

/** Thrown when an insert/update violates a unique or primary key constraint. */
export class DrizzleUniqueConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'DrizzleUniqueConstraintError';

	constructor(params: Omit<DrizzleConstraintErrorParams, 'constraintType'>) {
		super({ ...params, constraintType: 'unique' });
		this.name = 'DrizzleUniqueConstraintError';
	}
}

/** Thrown when an insert/update assigns `null` to a `NOT NULL` column. */
export class DrizzleNotNullConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'DrizzleNotNullConstraintError';

	constructor(params: Omit<DrizzleConstraintErrorParams, 'constraintType'>) {
		super({ ...params, constraintType: 'not_null' });
		this.name = 'DrizzleNotNullConstraintError';
	}
}

/** Thrown when a mutation breaks a foreign key relationship. */
export class DrizzleForeignKeyConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'DrizzleForeignKeyConstraintError';

	constructor(params: Omit<DrizzleConstraintErrorParams, 'constraintType'>) {
		super({ ...params, constraintType: 'foreign_key' });
		this.name = 'DrizzleForeignKeyConstraintError';
	}
}

/** Thrown when a row violates a `CHECK` constraint. */
export class DrizzleCheckConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'DrizzleCheckConstraintError';

	constructor(params: Omit<DrizzleConstraintErrorParams, 'constraintType'>) {
		super({ ...params, constraintType: 'check' });
		this.name = 'DrizzleCheckConstraintError';
	}
}

/** Returns `true` when the error is a mapped constraint violation. */
export function isDrizzleConstraintError(value: unknown): value is DrizzleConstraintError {
	return is(value, DrizzleConstraintError);
}

/** Returns `true` when the error is a unique (or primary key) constraint violation. */
export function isUniqueConstraintError(value: unknown): value is DrizzleUniqueConstraintError {
	return is(value, DrizzleUniqueConstraintError);
}

/** Returns `true` when the error is a `NOT NULL` constraint violation. */
export function isNotNullConstraintError(value: unknown): value is DrizzleNotNullConstraintError {
	return is(value, DrizzleNotNullConstraintError);
}

/** Returns `true` when the error is a foreign key constraint violation. */
export function isForeignKeyConstraintError(value: unknown): value is DrizzleForeignKeyConstraintError {
	return is(value, DrizzleForeignKeyConstraintError);
}

/** Returns `true` when the error is a `CHECK` constraint violation. */
export function isCheckConstraintError(value: unknown): value is DrizzleCheckConstraintError {
	return is(value, DrizzleCheckConstraintError);
}

// ---------- driver error mapping (internal helpers) ----------

/** `iife`-free safe getter for driver error fields (numbers, strings, nullish and non-object errors are tolerated) */
function field(error: unknown, ...names: string[]): string | number | undefined {
	if (error === null || typeof error !== 'object') return undefined;
	for (const name of names) {
		const value = (error as Record<string, unknown>)[name];
		if (typeof value === 'string' && value.length > 0) return value;
		if (typeof value === 'number' && Number.isFinite(value)) return value;
	}
	return undefined;
}

function str(error: unknown, ...names: string[]): string | undefined {
	const value = field(error, ...names);
	return typeof value === 'string' ? value : undefined;
}

function constraintFor(type: DrizzleConstraintType, params: Omit<DrizzleConstraintErrorParams, 'constraintType'>) {
	switch (type) {
		case 'unique': {
			return new DrizzleUniqueConstraintError(params);
		}
		case 'not_null': {
			return new DrizzleNotNullConstraintError(params);
		}
		case 'foreign_key': {
			return new DrizzleForeignKeyConstraintError(params);
		}
		case 'check': {
			return new DrizzleCheckConstraintError(params);
		}
		default: {
			return new DrizzleConstraintError({ ...params, constraintType: 'unknown' });
		}
	}
}

/** PostgreSQL SQLSTATE prefixes/classes treated as constraint violations */
const PG_CONSTRAINT_SQLSTATES: Record<string, DrizzleConstraintType | undefined> = {
	'23000': 'unknown',
	'23001': 'unknown',
	'23502': 'not_null',
	'23503': 'foreign_key',
	'23505': 'unique',
	'23514': 'check',
	'23P01': 'unknown',
};

/**
 * Maps a native PostgreSQL driver error (node-postgres, postgres-js, pglite, neon, aws-data-api, ...)
 * to a typed {@link DrizzleConstraintError}. Returns `undefined` when the error is not a constraint violation.
 */
export function mapPgConstraintError(error: unknown): DrizzleConstraintError | undefined {
	if (error === null || typeof error !== 'object') return undefined;

	const sqlState = str(error, 'code');
	const type = sqlState === undefined ? undefined : PG_CONSTRAINT_SQLSTATES[sqlState];
	if (type === undefined) return undefined;

	const detail = str(error, 'detail');
	let column = str(error, 'column', 'column_name');
	let constraint = str(error, 'constraint', 'constraint_name');
	const table = str(error, 'table', 'table_name');

	// `Key (email)=(duplicate@example.com) already exists.` — recover columns for unique violations
	if (type === 'unique' && detail !== undefined && column === undefined) {
		const match = /Key \(([^)]+)\)=/.exec(detail);
		if (match) column = match[1]!.split(', ')[0]!;
	}

	return constraintFor(type, { cause: error, code: sqlState, table, column, constraint, detail });
}

const MYSQL_CONSTRAINT_ERRNOS: Record<number, DrizzleConstraintType | undefined> = {
	1022: 'unique', // ER_DUP_KEY — duplicate key, key name unavailable
	1048: 'not_null', // ER_BAD_NULL_ERROR
	1062: 'unique', // ER_DUP_ENTRY
	1451: 'foreign_key', // ER_ROW_IS_REFERENCED_2
	1452: 'foreign_key', // ER_NO_REFERENCED_ROW_2
	1586: 'unique', // ER_DUP_ENTRY_WITH_KEY_NAME
	3819: 'check', // ER_CHECK_CONSTRAINT_VIOLATED (MySQL 8)
	4025: 'check', // ER_CHECK_CONSTRAINT_FAILED (MariaDB)
};

/** MySQL: `Duplicate entry ''rule'' for key ''rule.PRIMARY''` or legacy `... for key ''PRIMARY''` */
function parseMySqlUniqueKey(message: string): { table?: string; constraint?: string } {
	const match = /for key '([^']+)'/.exec(message);
	if (!match) return {};
	const key = match[1]!;
	const dot = key.indexOf('.');
	if (dot === -1) {
		return { constraint: key };
	}
	return { table: key.slice(0, dot), constraint: key.slice(dot + 1) };
}

/** MySQL (1451/1452): `Cannot delete or update a parent row: ... (`schema`.`table`, ... CONSTRAINT `name` ...` */
function parseMySqlForeignKey(message: string): { table?: string; constraint?: string } {
	const tableMatch = /`([^`]+)`\.`([^`]+)`/.exec(message);
	const constraintMatch = /CONSTRAINT `([^`]+)`/.exec(message);
	return { table: tableMatch?.[2], constraint: constraintMatch?.[1] };
}

/**
 * Maps a native MySQL driver error (mysql2, planetscale, tidb, ...) to a typed {@link DrizzleConstraintError}.
 * Returns `undefined` when the error is not a constraint violation.
 */
export function mapMySqlConstraintError(error: unknown): DrizzleConstraintError | undefined {
	if (error === null || typeof error !== 'object') return undefined;

	const code = field(error, 'errno');
	const sqlState = str(error, 'sqlState', 'sqlstate');
	const message = str(error, 'sqlMessage', 'message') ?? '';

	// fall back to SQLSTATE when `errno` is unavailable (proxy layers often only forward `sqlState`)
	if (typeof code !== 'number') {
		if (sqlState?.startsWith('23')) {
			return constraintFor('unknown', { cause: error, code: sqlState, detail: message });
		}
		return undefined;
	}

	const type = MYSQL_CONSTRAINT_ERRNOS[code];
	if (type === undefined) return undefined;

	let table: string | undefined;
	let column: string | undefined;
	let constraint: string | undefined;

	if (type === 'unique') {
		const parsed = parseMySqlUniqueKey(message);
		table = parsed.table;
		constraint = parsed.constraint;
	} else if (type === 'not_null') {
		const match = /Column '([^']+)' cannot be null/.exec(message);
		column = match?.[1];
	} else if (type === 'foreign_key') {
		const parsed = parseMySqlForeignKey(message);
		table = parsed.table;
		constraint = parsed.constraint;
	} else if (type === 'check') {
		const match = /Check constraint '([^']+)' is violated/.exec(message)
			?? /CONSTRAINT `([^`]+)` failed for `([^`]+)`/.exec(message);
		constraint = match?.[1];
		table = (match as RegExpExecArray | null)?.[2];
	}

	return constraintFor(type, { cause: error, code, table, column, constraint, detail: message });
}

const SQLITE_CONSTRAINT_FAMILIES: Record<string, DrizzleConstraintType | undefined> = {
	SQLITE_CONSTRAINT_CHECK: 'check',
	SQLITE_CONSTRAINT_COMMITHOOK: 'unknown',
	SQLITE_CONSTRAINT_FOREIGNKEY: 'foreign_key',
	SQLITE_CONSTRAINT_FUNCTION: 'unknown',
	SQLITE_CONSTRAINT_NOTNULL: 'not_null',
	SQLITE_CONSTRAINT_PRIMARYKEY: 'unique',
	SQLITE_CONSTRAINT_ROWID: 'unique',
	SQLITE_CONSTRAINT_TRIGGER: 'unknown',
	SQLITE_CONSTRAINT_UNIQUE: 'unique',
	SQLITE_CONSTRAINT_VTAB: 'unknown',
};

/** SQLite: `UNIQUE constraint failed: users.email` (possibly composite: `users.a, users.b`) */
function parseSQLiteColumns(message: string): { table?: string; column?: string } {
	const match = /constraint failed: ([^;]+)$/i.exec(message.trim());
	if (!match) return {};
	const first = match[1]!.split(',')[0]!.trim().split('.');
	return { table: first.length > 1 ? first[0]! : undefined, column: first[first.length - 1]! };
}

/**
 * Maps a native SQLite driver error (better-sqlite3, bun-sqlite, libsql, node:sqlite, ...) to a typed
 * {@link DrizzleConstraintError}. Returns `undefined` when the error is not a constraint violation.
 */
export function mapSQLiteConstraintError(error: unknown): DrizzleConstraintError | undefined {
	if (error === null || typeof error !== 'object') return undefined;

	const code = str(error, 'code') ?? '';
	const message = str(error, 'message') ?? '';

	let type = SQLITE_CONSTRAINT_FAMILIES[code];

	if (type === undefined && (code === 'SQLITE_CONSTRAINT' || code === '')) {
		// libsql/d1 style: generic code, or no code at all — derive the family from the message
		if (/UNIQUE constraint failed/i.test(message) || /PRIMARY KEY must be unique/i.test(message)) type = 'unique';
		else if (/NOT NULL constraint failed/i.test(message)) type = 'not_null';
		else if (/FOREIGN KEY constraint failed/i.test(message)) type = 'foreign_key';
		else if (/CHECK constraint failed/i.test(message)) type = 'check';
	}

	if (type === undefined && code.startsWith('SQLITE_CONSTRAINT')) {
		type = 'unknown';
	}

	if (type === undefined) return undefined;

	let table: string | undefined;
	let column: string | undefined;
	let constraint: string | undefined;

	if (type === 'unique' || type === 'not_null') {
		const parsed = parseSQLiteColumns(message);
		table = parsed.table;
		column = parsed.column;
	} else if (type === 'check') {
		constraint = /CHECK constraint failed: ([^:]+)$/.exec(message)?.[1]?.trim() || undefined;
	}

	return constraintFor(type, { cause: error, code, table, column, constraint, detail: message });
}
