import { entityKind } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export class DrizzleQueryError extends Error {
	static readonly [entityKind]: string = 'DrizzleQueryError';

	constructor(
		public query: string,
		public params: any[],
		public override cause?: Error,
	) {
		super(`Failed query: ${query}\nparams: ${params}`);
		Error.captureStackTrace?.(this, DrizzleQueryError);

		// ES2022+: preserves original error on `.cause`
		if (cause) (this as any).cause = cause;
	}
}

/** The normalized category of an integrity-constraint violation. */
export type ConstraintViolationKind = 'unique' | 'not_null' | 'foreign_key' | 'check';

/** Best-effort metadata extracted from the underlying driver error. */
export interface ConstraintViolationDetails {
	constraintName?: string;
	table?: string;
	columns?: string[];
}

/**
 * Base class for integrity-constraint violations, normalized across dialects.
 * The original driver error is always available on `.cause`.
 */
export class DrizzleConstraintError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'DrizzleConstraintError';

	readonly kind: ConstraintViolationKind;
	readonly constraintName?: string;
	readonly table?: string;
	readonly columns?: string[];

	constructor(
		kind: ConstraintViolationKind,
		query: string,
		params: any[],
		cause: Error,
		details: ConstraintViolationDetails = {},
	) {
		super(query, params, cause);
		this.name = 'DrizzleConstraintError';
		this.kind = kind;
		this.constraintName = details.constraintName;
		this.table = details.table;
		this.columns = details.columns;
		Error.captureStackTrace?.(this, DrizzleConstraintError);
	}
}

export class UniqueConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'UniqueConstraintError';

	constructor(query: string, params: any[], cause: Error, details?: ConstraintViolationDetails) {
		super('unique', query, params, cause, details);
		this.name = 'UniqueConstraintError';
		Error.captureStackTrace?.(this, UniqueConstraintError);
	}
}

export class NotNullConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'NotNullConstraintError';

	constructor(query: string, params: any[], cause: Error, details?: ConstraintViolationDetails) {
		super('not_null', query, params, cause, details);
		this.name = 'NotNullConstraintError';
		Error.captureStackTrace?.(this, NotNullConstraintError);
	}
}

export class ForeignKeyConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'ForeignKeyConstraintError';

	constructor(query: string, params: any[], cause: Error, details?: ConstraintViolationDetails) {
		super('foreign_key', query, params, cause, details);
		this.name = 'ForeignKeyConstraintError';
		Error.captureStackTrace?.(this, ForeignKeyConstraintError);
	}
}

export class CheckConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'CheckConstraintError';

	constructor(query: string, params: any[], cause: Error, details?: ConstraintViolationDetails) {
		super('check', query, params, cause, details);
		this.name = 'CheckConstraintError';
		Error.captureStackTrace?.(this, CheckConstraintError);
	}
}

function firstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.length > 0) return value;
	}
	return undefined;
}

/**
 * Wrap a PostgreSQL driver error (pg, postgres.js, neon, pglite, vercel-postgres, …).
 * Classification is driven by the SQLSTATE on `.code`, which is consistent across
 * every Postgres driver; column/table/constraint names are best-effort.
 * @internal
 */
export function wrapPgError(query: string, params: any[], error: Error): DrizzleQueryError {
	const driverError = error as Record<string, any>;
	const code = firstString(driverError['code']);
	if (code === undefined) return new DrizzleQueryError(query, params, error);

	const columnName = firstString(driverError['column'], driverError['column_name']);
	const details: ConstraintViolationDetails = {
		constraintName: firstString(driverError['constraint'], driverError['constraint_name']),
		table: firstString(driverError['table'], driverError['table_name']),
		columns: columnName ? [columnName] : undefined,
	};

	switch (code) {
		case '23505': {
			return new UniqueConstraintError(query, params, error, details);
		}
		case '23502': {
			return new NotNullConstraintError(query, params, error, details);
		}
		case '23503': {
			return new ForeignKeyConstraintError(query, params, error, details);
		}
		case '23514': {
			return new CheckConstraintError(query, params, error, details);
		}
		default: {
			return new DrizzleQueryError(query, params, error);
		}
	}
}

/**
 * Wrap a MySQL-protocol driver error (mysql2, SingleStore, TiDB, …).
 * Classification is driven by the numeric `.errno`; names are parsed from `sqlMessage`.
 * @internal
 */
export function wrapMySqlError(query: string, params: any[], error: Error): DrizzleQueryError {
	const driverError = error as Record<string, any>;
	const errno = typeof driverError['errno'] === 'number' ? driverError['errno'] as number : undefined;
	if (errno === undefined) return new DrizzleQueryError(query, params, error);

	const message = firstString(driverError['sqlMessage'], driverError['message']) ?? '';

	switch (errno) {
		case 1062: { // ER_DUP_ENTRY
			// "Duplicate entry '...' for key 'constraint_name'"
			const constraintName = message.match(/for key '([^']+)'/)?.[1];
			return new UniqueConstraintError(query, params, error, { constraintName });
		}
		case 1048: { // ER_BAD_NULL_ERROR
			// "Column 'col' cannot be null"
			const column = message.match(/Column '([^']+)'/)?.[1];
			return new NotNullConstraintError(query, params, error, { columns: column ? [column] : undefined });
		}
		case 1452: // ER_NO_REFERENCED_ROW_2
		case 1216: { // ER_NO_REFERENCED_ROW
			// "... (`schema`.`table`, CONSTRAINT `fk_name` FOREIGN KEY ...)"
			const constraintName = message.match(/CONSTRAINT `([^`]+)`/)?.[1];
			const table = message.match(/`[^`]*`\.`([^`]+)`/)?.[1];
			return new ForeignKeyConstraintError(query, params, error, { constraintName, table });
		}
		case 3819: { // ER_CHECK_CONSTRAINT_VIOLATED
			// "Check constraint 'chk_name' is violated."
			const constraintName = message.match(/Check constraint '([^']+)'/)?.[1];
			return new CheckConstraintError(query, params, error, { constraintName });
		}
		default: {
			return new DrizzleQueryError(query, params, error);
		}
	}
}

function parseSqliteColumns(message: string): { table?: string; columns?: string[] } {
	// "UNIQUE constraint failed: users.email, users.name"
	const list = message.match(/constraint failed: (.+)$/)?.[1];
	if (!list) return {};
	const pairs = list.split(',').map((part) => part.trim()).filter(Boolean);
	const columns: string[] = [];
	let table: string | undefined;
	for (const pair of pairs) {
		const dot = pair.indexOf('.');
		if (dot === -1) continue;
		table ??= pair.slice(0, dot);
		columns.push(pair.slice(dot + 1));
	}
	return { table, columns: columns.length > 0 ? columns : undefined };
}

/**
 * Wrap a SQLite driver error (better-sqlite3, bun:sqlite, libsql, d1, expo, op-sqlite, …).
 * Prefers the extended `.code` (`SQLITE_CONSTRAINT_*`) and falls back to message text
 * for drivers that don't surface extended result codes (e.g. libsql, d1).
 * @internal
 */
export function wrapSqliteError(query: string, params: any[], error: Error): DrizzleQueryError {
	const driverError = error as Record<string, any>;
	const code = firstString(driverError['code']);
	const message = firstString(driverError['message']) ?? '';

	if (code !== undefined && code.startsWith('SQLITE_CONSTRAINT')) {
		switch (code) {
			case 'SQLITE_CONSTRAINT_UNIQUE':
			case 'SQLITE_CONSTRAINT_PRIMARYKEY': {
				return new UniqueConstraintError(query, params, error, parseSqliteColumns(message));
			}
			case 'SQLITE_CONSTRAINT_NOTNULL': {
				return new NotNullConstraintError(query, params, error, parseSqliteColumns(message));
			}
			case 'SQLITE_CONSTRAINT_FOREIGNKEY': {
				return new ForeignKeyConstraintError(query, params, error);
			}
			case 'SQLITE_CONSTRAINT_CHECK': {
				const constraintName = message.match(/CHECK constraint failed: (\S+)/)?.[1];
				return new CheckConstraintError(query, params, error, { constraintName });
			}
		}
	}

	if (message.includes('UNIQUE constraint failed')) {
		return new UniqueConstraintError(query, params, error, parseSqliteColumns(message));
	}
	if (message.includes('NOT NULL constraint failed')) {
		return new NotNullConstraintError(query, params, error, parseSqliteColumns(message));
	}
	if (message.includes('FOREIGN KEY constraint failed')) {
		return new ForeignKeyConstraintError(query, params, error);
	}
	if (message.includes('CHECK constraint failed')) {
		const constraintName = message.match(/CHECK constraint failed: (\S+)/)?.[1];
		return new CheckConstraintError(query, params, error, { constraintName });
	}

	return new DrizzleQueryError(query, params, error);
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}
