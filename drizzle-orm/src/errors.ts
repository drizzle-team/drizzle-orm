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

export class DrizzleConstraintError extends DrizzleQueryError {
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

/** @internal */
export function wrapQueryError(query: string, params: any[], error: Error): DrizzleQueryError {
	const driverError = error as Record<string, any>;

	// PostgreSQL error codes (pg, postgres.js, neon)
	const pgCode = driverError['code'] as string | undefined;
	if (typeof pgCode === 'string') {
		const table = driverError['table'] as string | undefined;
		const column = driverError['column'] as string | undefined;
		const constraint = driverError['constraint'] as string | undefined;

		switch (pgCode) {
			case '23505': // unique_violation
				return new UniqueConstraintViolationError(query, params, error, constraint, table, column);
			case '23502': // not_null_violation
				return new NotNullViolationError(query, params, error, constraint, table, column);
			case '23503': // foreign_key_violation
				return new ForeignKeyViolationError(query, params, error, constraint, table, column);
			case '23514': // check_violation
				return new CheckConstraintViolationError(query, params, error, constraint, table, column);
		}
	}

	// MySQL error codes (mysql2)
	const mysqlErrno = driverError['errno'] as number | undefined;
	if (typeof mysqlErrno === 'number') {
		const sqlMessage = driverError['sqlMessage'] as string | undefined;
		const mysqlTable = extractMysqlTable(sqlMessage);
		const mysqlColumn = extractMysqlColumn(sqlMessage, mysqlErrno);
		const mysqlConstraint = extractMysqlConstraint(sqlMessage, mysqlErrno);

		switch (mysqlErrno) {
			case 1062: // ER_DUP_ENTRY (unique constraint)
				return new UniqueConstraintViolationError(query, params, error, mysqlConstraint, mysqlTable, mysqlColumn);
			case 1048: // ER_BAD_NULL_ERROR (not null)
				return new NotNullViolationError(query, params, error, undefined, mysqlTable, mysqlColumn);
			case 1452: // ER_NO_REFERENCED_ROW_2 (foreign key)
				return new ForeignKeyViolationError(query, params, error, mysqlConstraint, mysqlTable, mysqlColumn);
			case 1216: // ER_NO_REFERENCED_ROW (foreign key, older form)
				return new ForeignKeyViolationError(query, params, error, mysqlConstraint, mysqlTable, mysqlColumn);
			case 3819: // ER_CHECK_CONSTRAINT_VIOLATED
				return new CheckConstraintViolationError(query, params, error, mysqlConstraint, mysqlTable, mysqlColumn);
		}
	}

	// SQLite error codes (better-sqlite3, libsql)
	// SQLite errors typically have a `code` like 'SQLITE_CONSTRAINT_UNIQUE' or the message contains the constraint type
	const sqliteCode = driverError['code'] as string | undefined;
	const message = driverError['message'] as string | undefined ?? '';

	if (typeof sqliteCode === 'string' && sqliteCode.startsWith('SQLITE_CONSTRAINT')) {
		const sqliteTable = extractSqliteTable(message);
		const sqliteColumn = extractSqliteColumn(message);

		if (sqliteCode === 'SQLITE_CONSTRAINT_UNIQUE' || sqliteCode === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
			return new UniqueConstraintViolationError(query, params, error, undefined, sqliteTable, sqliteColumn);
		}
		if (sqliteCode === 'SQLITE_CONSTRAINT_NOTNULL') {
			return new NotNullViolationError(query, params, error, undefined, sqliteTable, sqliteColumn);
		}
		if (sqliteCode === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
			return new ForeignKeyViolationError(query, params, error, undefined, sqliteTable, sqliteColumn);
		}
		if (sqliteCode === 'SQLITE_CONSTRAINT_CHECK') {
			return new CheckConstraintViolationError(query, params, error, undefined, sqliteTable, sqliteColumn);
		}
	}

	// Some SQLite drivers (like libsql) don't set extended error codes but put the info in the message
	if (typeof message === 'string') {
		if (message.includes('UNIQUE constraint failed')) {
			const sqliteTable = extractSqliteTable(message);
			const sqliteColumn = extractSqliteColumn(message);
			return new UniqueConstraintViolationError(query, params, error, undefined, sqliteTable, sqliteColumn);
		}
		if (message.includes('NOT NULL constraint failed')) {
			const sqliteTable = extractSqliteTable(message);
			const sqliteColumn = extractSqliteColumn(message);
			return new NotNullViolationError(query, params, error, undefined, sqliteTable, sqliteColumn);
		}
		if (message.includes('FOREIGN KEY constraint failed')) {
			return new ForeignKeyViolationError(query, params, error, undefined, undefined, undefined);
		}
		if (message.includes('CHECK constraint failed')) {
			const checkName = extractSqliteCheckName(message);
			return new CheckConstraintViolationError(query, params, error, checkName, undefined, undefined);
		}
	}

	return new DrizzleQueryError(query, params, error);
}

// --- MySQL message parsers ---

function extractMysqlConstraint(message: string | undefined, errno: number): string | undefined {
	if (!message) return undefined;

	if (errno === 1062) {
		// "Duplicate entry '...' for key 'constraint_name'"
		const match = message.match(/for key '([^']+)'/);
		return match?.[1];
	}
	if (errno === 1452 || errno === 1216) {
		// "CONSTRAINT `fk_name` FOREIGN KEY ..."
		const match = message.match(/CONSTRAINT `([^`]+)`/);
		return match?.[1];
	}
	if (errno === 3819) {
		// "Check constraint 'chk_name' is violated"
		const match = message.match(/Check constraint '([^']+)'/);
		return match?.[1];
	}
	return undefined;
}

function extractMysqlTable(message: string | undefined): string | undefined {
	if (!message) return undefined;
	// "Column 'col' cannot be null" doesn't have table info
	// FK messages: "... table `schema`.`table_name`, ..."
	const match = message.match(/table `[^`]*`\.`([^`]+)`/);
	return match?.[1];
}

function extractMysqlColumn(message: string | undefined, errno: number): string | undefined {
	if (!message) return undefined;

	if (errno === 1048) {
		// "Column 'col_name' cannot be null"
		const match = message.match(/Column '([^']+)'/);
		return match?.[1];
	}
	return undefined;
}

// --- SQLite message parsers ---

function extractSqliteTable(message: string): string | undefined {
	// "UNIQUE constraint failed: table_name.column_name"
	// "NOT NULL constraint failed: table_name.column_name"
	const match = message.match(/constraint failed: ([^.]+)\./);
	return match?.[1];
}

function extractSqliteColumn(message: string): string | undefined {
	// "UNIQUE constraint failed: table_name.column_name"
	const match = message.match(/constraint failed: [^.]+\.(\S+)/);
	return match?.[1];
}

function extractSqliteCheckName(message: string): string | undefined {
	// "CHECK constraint failed: check_name"
	const match = message.match(/CHECK constraint failed: (\S+)/);
	return match?.[1];
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}
