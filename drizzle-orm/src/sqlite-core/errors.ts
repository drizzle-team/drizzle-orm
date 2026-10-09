import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';

/**
 * SQLite extended result codes / libsql message markers.
 * @see https://www.sqlite.org/rescode.html
 */
export const SQLITE_ERROR = {
	CONSTRAINT: 'SQLITE_CONSTRAINT',
	CONSTRAINT_UNIQUE: 'SQLITE_CONSTRAINT_UNIQUE',
	CONSTRAINT_PRIMARYKEY: 'SQLITE_CONSTRAINT_PRIMARYKEY',
	CONSTRAINT_NOTNULL: 'SQLITE_CONSTRAINT_NOTNULL',
	CONSTRAINT_FOREIGNKEY: 'SQLITE_CONSTRAINT_FOREIGNKEY',
	CONSTRAINT_CHECK: 'SQLITE_CONSTRAINT_CHECK',
} as const;

export type SqliteConstraintKind = 'unique' | 'not_null' | 'foreign_key' | 'check' | 'constraint';

type DriverLike = {
	code?: unknown;
	message?: unknown;
	rawCode?: unknown;
};

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractSqliteDriverFields(cause: unknown): DriverLike | undefined {
	if (!cause || typeof cause !== 'object') return undefined;
	const c = cause as DriverLike & { cause?: unknown };
	if (typeof c.code === 'string' || typeof c.message === 'string') return c;
	if (c.cause && typeof c.cause === 'object') return c.cause as DriverLike;
	return c;
}

export function classifySqliteConstraint(
	code: string | undefined,
	message: string | undefined,
): SqliteConstraintKind | undefined {
	const c = (code ?? '').toUpperCase();
	const m = (message ?? '').toUpperCase();

	if (
		c === SQLITE_ERROR.CONSTRAINT_UNIQUE
		|| c === SQLITE_ERROR.CONSTRAINT_PRIMARYKEY
		|| m.includes('UNIQUE CONSTRAINT FAILED')
	) {
		return 'unique';
	}
	if (c === SQLITE_ERROR.CONSTRAINT_NOTNULL || m.includes('NOT NULL CONSTRAINT FAILED')) {
		return 'not_null';
	}
	if (c === SQLITE_ERROR.CONSTRAINT_FOREIGNKEY || m.includes('FOREIGN KEY CONSTRAINT FAILED')) {
		return 'foreign_key';
	}
	if (c === SQLITE_ERROR.CONSTRAINT_CHECK || m.includes('CHECK CONSTRAINT FAILED')) {
		return 'check';
	}
	if (c.startsWith('SQLITE_CONSTRAINT') || m.includes('CONSTRAINT FAILED')) {
		return 'constraint';
	}
	return undefined;
}

/** Parse `UNIQUE constraint failed: users.email` → table/columns. */
export function parseSqliteConstraintTarget(message: string | undefined): {
	table?: string;
	columns?: string[];
} {
	if (!message) return {};
	const match = message.match(/constraint failed:\s*(.+)$/i);
	if (!match) return {};
	const parts = match[1].split(',').map((s) => s.trim()).filter(Boolean);
	if (!parts.length) return {};
	const columns: string[] = [];
	let table: string | undefined;
	for (const part of parts) {
		const [t, col] = part.includes('.') ? part.split('.', 2) : [undefined, part];
		if (t) table = t;
		if (col) columns.push(col);
	}
	return { table, columns: columns.length ? columns : undefined };
}

/**
 * Dialect-native SQLite query error with constraint classification.
 */
export class SqliteError extends DrizzleQueryError {
	static readonly [entityKind]: string = 'SqliteError';

	readonly code?: string;
	readonly constraintKind: SqliteConstraintKind;
	readonly table?: string;
	readonly columns?: string[];

	constructor(
		query: string,
		params: any[],
		cause: Error | undefined,
		fields: {
			code?: string;
			constraintKind: SqliteConstraintKind;
			table?: string;
			columns?: string[];
		},
	) {
		super(query, params, cause);
		this.name = 'SqliteError';
		this.code = fields.code;
		this.constraintKind = fields.constraintKind;
		this.table = fields.table;
		this.columns = fields.columns;
		Error.captureStackTrace?.(this, SqliteError);
	}
}

export function isSqliteError(error: unknown): error is SqliteError {
	return is(error, SqliteError);
}

export function isSqliteUniqueViolation(error: unknown): error is SqliteError {
	return isSqliteError(error) && error.constraintKind === 'unique';
}

export function isSqliteNotNullViolation(error: unknown): error is SqliteError {
	return isSqliteError(error) && error.constraintKind === 'not_null';
}

export function isSqliteForeignKeyViolation(error: unknown): error is SqliteError {
	return isSqliteError(error) && error.constraintKind === 'foreign_key';
}

export function isSqliteCheckViolation(error: unknown): error is SqliteError {
	return isSqliteError(error) && error.constraintKind === 'check';
}

export function wrapSqliteError(query: string, params: any[], cause: unknown): DrizzleQueryError {
	const err = cause instanceof Error ? cause : new Error(String(cause));
	const driver = extractSqliteDriverFields(cause);
	const code = asString(driver?.code);
	const message = asString(driver?.message) ?? (err.message || undefined);
	const kind = classifySqliteConstraint(code, message);
	if (!kind) {
		return new DrizzleQueryError(query, params, err);
	}
	const target = parseSqliteConstraintTarget(message);
	return new SqliteError(query, params, err, {
		code,
		constraintKind: kind,
		table: target.table,
		columns: target.columns,
	});
}
