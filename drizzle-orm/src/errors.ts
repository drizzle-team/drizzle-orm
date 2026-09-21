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
		Error.captureStackTrace(this, DrizzleQueryError);

		// ES2022+: preserves original error on `.cause`
		if (cause) (this as any).cause = cause;
	}
}

export type ConstraintType = 'unique' | 'not_null' | 'foreign_key' | 'check';

/** Driver-independent constraint failure. `cause` is the original driver error. */
export class DrizzleConstraintError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'DrizzleConstraintError';

	constructor(
		query: string,
		params: any[],
		cause: Error,
		public readonly constraintType: ConstraintType,
		public readonly constraintName: string | undefined,
		public readonly table: string | undefined,
		public readonly column: string | undefined,
	) {
		super(query, params, cause);
		this.name = 'DrizzleConstraintError';
		Error.captureStackTrace(this, DrizzleConstraintError);
	}
}

export class UniqueConstraintViolationError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'UniqueConstraintViolationError';

	constructor(
		query: string,
		params: any[],
		cause: Error,
		constraintName: string | undefined,
		table: string | undefined,
		column: string | undefined,
	) {
		super(query, params, cause, 'unique', constraintName, table, column);
		this.name = 'UniqueConstraintViolationError';
		Error.captureStackTrace(this, UniqueConstraintViolationError);
	}
}

export class NotNullViolationError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'NotNullViolationError';

	constructor(
		query: string,
		params: any[],
		cause: Error,
		constraintName: string | undefined,
		table: string | undefined,
		column: string | undefined,
	) {
		super(query, params, cause, 'not_null', constraintName, table, column);
		this.name = 'NotNullViolationError';
		Error.captureStackTrace(this, NotNullViolationError);
	}
}

export class ForeignKeyViolationError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'ForeignKeyViolationError';

	constructor(
		query: string,
		params: any[],
		cause: Error,
		constraintName: string | undefined,
		table: string | undefined,
		column: string | undefined,
	) {
		super(query, params, cause, 'foreign_key', constraintName, table, column);
		this.name = 'ForeignKeyViolationError';
		Error.captureStackTrace(this, ForeignKeyViolationError);
	}
}

export class CheckConstraintViolationError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'CheckConstraintViolationError';

	constructor(
		query: string,
		params: any[],
		cause: Error,
		constraintName: string | undefined,
		table: string | undefined,
		column: string | undefined,
	) {
		super(query, params, cause, 'check', constraintName, table, column);
		this.name = 'CheckConstraintViolationError';
		Error.captureStackTrace(this, CheckConstraintViolationError);
	}
}

/**
 * Map a raw driver error onto a typed constraint error when the SQLSTATE / errno /
 * SQLite code is one we know. Unknown errors still become `DrizzleQueryError`.
 *
 * Postgres-family drivers use SQLSTATE `code`.
 * MySQL / SingleStore uses numeric `errno`.
 * SQLite uses `SQLITE_CONSTRAINT_*` or a message from libsql.
 *
 * @internal
 */
export function wrapQueryError(query: string, params: any[], error: unknown): DrizzleQueryError {
	const driverError = typeof error === 'object' && error !== null
		? error as Record<string, unknown>
		: {};
	const cause = error as Error;

	const pgCode = driverError['code'] as string | undefined;
	if (typeof pgCode === 'string') {
		const table = driverError['table'] as string | undefined;
		const column = driverError['column'] as string | undefined;
		const constraint = driverError['constraint'] as string | undefined;

		switch (pgCode) {
			case '23505':
				return new UniqueConstraintViolationError(query, params, cause, constraint, table, column);
			case '23502':
				return new NotNullViolationError(query, params, cause, constraint, table, column);
			case '23503':
				return new ForeignKeyViolationError(query, params, cause, constraint, table, column);
			case '23514':
				return new CheckConstraintViolationError(query, params, cause, constraint, table, column);
		}
	}

	const mysqlErrno = driverError['errno'] as number | undefined;
	if (typeof mysqlErrno === 'number') {
		const sqlMessage = (driverError['sqlMessage'] as string | undefined)
			?? (driverError['message'] as string | undefined);
		const mysqlTable = extractMysqlTable(sqlMessage);
		const mysqlColumn = extractMysqlColumn(sqlMessage, mysqlErrno);
		const mysqlConstraint = extractMysqlConstraint(sqlMessage, mysqlErrno);

		switch (mysqlErrno) {
			case 1062:
				return new UniqueConstraintViolationError(query, params, cause, mysqlConstraint, mysqlTable, mysqlColumn);
			case 1048:
				return new NotNullViolationError(query, params, cause, undefined, mysqlTable, mysqlColumn);
			case 1451:
			case 1452:
			case 1216:
			case 1217:
				return new ForeignKeyViolationError(query, params, cause, mysqlConstraint, mysqlTable, mysqlColumn);
			case 3819:
				return new CheckConstraintViolationError(query, params, cause, mysqlConstraint, mysqlTable, mysqlColumn);
		}
	}

	const sqliteCode = driverError['code'] as string | undefined;
	const message = (driverError['message'] as string | undefined) ?? '';

	if (typeof sqliteCode === 'string' && sqliteCode.startsWith('SQLITE_CONSTRAINT')) {
		const sqliteTable = extractSqliteTable(message);
		const sqliteColumn = extractSqliteColumn(message);

		if (sqliteCode === 'SQLITE_CONSTRAINT_UNIQUE' || sqliteCode === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
			return new UniqueConstraintViolationError(query, params, cause, undefined, sqliteTable, sqliteColumn);
		}
		if (sqliteCode === 'SQLITE_CONSTRAINT_NOTNULL') {
			return new NotNullViolationError(query, params, cause, undefined, sqliteTable, sqliteColumn);
		}
		if (sqliteCode === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
			return new ForeignKeyViolationError(query, params, cause, undefined, sqliteTable, sqliteColumn);
		}
		if (sqliteCode === 'SQLITE_CONSTRAINT_CHECK') {
			return new CheckConstraintViolationError(
				query,
				params,
				cause,
				extractSqliteCheckName(message),
				sqliteTable,
				sqliteColumn,
			);
		}
	}

	if (message.includes('UNIQUE constraint failed')) {
		return new UniqueConstraintViolationError(
			query,
			params,
			cause,
			undefined,
			extractSqliteTable(message),
			extractSqliteColumn(message),
		);
	}
	if (message.includes('NOT NULL constraint failed')) {
		return new NotNullViolationError(
			query,
			params,
			cause,
			undefined,
			extractSqliteTable(message),
			extractSqliteColumn(message),
		);
	}
	if (message.includes('FOREIGN KEY constraint failed')) {
		return new ForeignKeyViolationError(query, params, cause, undefined, undefined, undefined);
	}
	if (message.includes('CHECK constraint failed')) {
		return new CheckConstraintViolationError(
			query,
			params,
			cause,
			extractSqliteCheckName(message),
			undefined,
			undefined,
		);
	}

	return new DrizzleQueryError(query, params, cause);
}

function extractMysqlConstraint(message: string | undefined, errno: number): string | undefined {
	if (!message) return undefined;
	if (errno === 1062) {
		const match = message.match(/for key '([^']+)'/);
		return match?.[1];
	}
	if (errno === 1451 || errno === 1452 || errno === 1216 || errno === 1217) {
		const match = message.match(/CONSTRAINT `([^`]+)`/);
		return match?.[1];
	}
	if (errno === 3819) {
		const match = message.match(/Check constraint '([^']+)'/);
		return match?.[1];
	}
	return undefined;
}

function extractMysqlTable(message: string | undefined): string | undefined {
	if (!message) return undefined;
	// FK: "fails (`db`.`posts`, CONSTRAINT ...)" or "fails (`posts`, CONSTRAINT ...)"
	const fk = message.match(/fails \(`(?:[^`]+`\.`)?([^`]+)`/);
	if (fk) return fk[1];
	const qualified = message.match(/table `[^`]*`\.`([^`]+)`/);
	if (qualified) return qualified[1];
	const simple = message.match(/table `([^`]+)`/);
	return simple?.[1];
}

function extractMysqlColumn(message: string | undefined, errno: number): string | undefined {
	if (!message) return undefined;
	if (errno === 1048) {
		const match = message.match(/Column '([^']+)'/);
		return match?.[1];
	}
	if (errno === 1451 || errno === 1452 || errno === 1216 || errno === 1217) {
		const match = message.match(/FOREIGN KEY \(`([^`]+)`\)/);
		return match?.[1];
	}
	return undefined;
}

function extractSqliteTable(message: string): string | undefined {
	const match = message.match(/constraint failed: ([^.]+)\./);
	return match?.[1];
}

function extractSqliteColumn(message: string): string | undefined {
	const match = message.match(/constraint failed: [^.]+\.([^,\s]+)/);
	return match?.[1];
}

function extractSqliteCheckName(message: string): string | undefined {
	const match = message.match(/CHECK constraint failed:\s*(\S+)/);
	return match?.[1];
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}
