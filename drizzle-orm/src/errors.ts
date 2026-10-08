import { entityKind } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export type DrizzleQueryErrorKind =
	| 'unique_constraint'
	| 'foreign_key_constraint'
	| 'not_null_constraint'
	| 'check_constraint'
	| 'unknown';

export interface DrizzleQueryErrorInfo {
	kind: DrizzleQueryErrorKind;
	code?: string | number;
	constraint?: string;
	table?: string;
	column?: string;
	detail?: string;
	schema?: string;
}

export function parseDatabaseError(cause?: unknown): DrizzleQueryErrorInfo {
	if (!cause || typeof cause !== 'object') {
		return { kind: 'unknown' };
	}

	const err = cause as Record<string, unknown>;
	const code = (err['code'] ?? err['errno']) as string | number | undefined;
	const codeStr = String(code ?? '');
	const message = typeof err['message'] === 'string' ? err['message'] : '';
	const detail = typeof err['detail'] === 'string' ? err['detail'] : undefined;
	const constraint = (err['constraint'] ?? err['constraint_name']) as string | undefined;
	const table = (err['table'] ?? err['table_name']) as string | undefined;
	const column = (err['column'] ?? err['column_name']) as string | undefined;
	const schema = (err['schema'] ?? err['schema_name']) as string | undefined;

	// 1. PostgreSQL codes (pg, postgres.js, neon, etc.)
	if (codeStr === '23505') {
		return { kind: 'unique_constraint', code, constraint, table, column, detail, schema };
	}
	if (codeStr === '23503') {
		return { kind: 'foreign_key_constraint', code, constraint, table, column, detail, schema };
	}
	if (codeStr === '23502') {
		return { kind: 'not_null_constraint', code, constraint, table, column, detail, schema };
	}
	if (codeStr === '23514') {
		return { kind: 'check_constraint', code, constraint, table, column, detail, schema };
	}

	// 2. MySQL codes (mysql2, planetscale)
	if (codeStr === 'ER_DUP_ENTRY' || code === 1062) {
		const match = message.match(/Duplicate entry '(.*)' for key '(?:.*?\.)?([^']+)'/);
		return {
			kind: 'unique_constraint',
			code,
			constraint: match ? match[2] : constraint,
			detail: match ? match[1] : detail,
			table,
			column,
			schema,
		};
	}
	if (
		codeStr === 'ER_NO_REFERENCED_ROW_2' || codeStr === 'ER_NO_REFERENCED_ROW'
		|| codeStr === 'ER_ROW_IS_REFERENCED_2' || codeStr === 'ER_ROW_IS_REFERENCED'
		|| code === 1451 || code === 1452 || code === 1216 || code === 1217
	) {
		return { kind: 'foreign_key_constraint', code, constraint, table, column, detail, schema };
	}
	if (codeStr === 'ER_BAD_NULL_ERROR' || code === 1048) {
		const match = message.match(/Column '([^']+)' cannot be null/);
		return {
			kind: 'not_null_constraint',
			code,
			column: match ? match[1] : column,
			table,
			constraint,
			detail,
			schema,
		};
	}
	if (codeStr === 'ER_CHECK_CONSTRAINT_VIOLATED' || code === 3819) {
		const match = message.match(/Check constraint '([^']+)' is violated/);
		return {
			kind: 'check_constraint',
			code,
			constraint: match ? match[1] : constraint,
			table,
			column,
			detail,
			schema,
		};
	}

	// 3. SQLite (better-sqlite3, libsql, bun:sqlite, etc.)
	if (codeStr === 'SQLITE_CONSTRAINT_UNIQUE' || message.includes('UNIQUE constraint failed')) {
		const match = message.match(/UNIQUE constraint failed:\s*(?:(\w+)\.)?(\w+)/);
		return {
			kind: 'unique_constraint',
			code,
			table: match ? match[1] : table,
			column: match ? match[2] : column,
			constraint,
			detail,
			schema,
		};
	}
	if (codeStr === 'SQLITE_CONSTRAINT_FOREIGNKEY' || message.includes('FOREIGN KEY constraint failed')) {
		return { kind: 'foreign_key_constraint', code, constraint, table, column, detail, schema };
	}
	if (codeStr === 'SQLITE_CONSTRAINT_NOTNULL' || message.includes('NOT NULL constraint failed')) {
		const match = message.match(/NOT NULL constraint failed:\s*(?:(\w+)\.)?(\w+)/);
		return {
			kind: 'not_null_constraint',
			code,
			table: match ? match[1] : table,
			column: match ? match[2] : column,
			constraint,
			detail,
			schema,
		};
	}
	if (codeStr === 'SQLITE_CONSTRAINT_CHECK' || message.includes('CHECK constraint failed')) {
		return { kind: 'check_constraint', code, constraint, table, column, detail, schema };
	}

	// 4. Generic string message fallbacks
	const lowerMsg = message.toLowerCase();
	if (lowerMsg.includes('unique constraint') || lowerMsg.includes('duplicate key')) {
		return { kind: 'unique_constraint', code, constraint, table, column, detail, schema };
	}
	if (lowerMsg.includes('foreign key constraint')) {
		return { kind: 'foreign_key_constraint', code, constraint, table, column, detail, schema };
	}
	if (lowerMsg.includes('not-null constraint') || lowerMsg.includes('not null constraint')) {
		return { kind: 'not_null_constraint', code, constraint, table, column, detail, schema };
	}
	if (lowerMsg.includes('check constraint')) {
		return { kind: 'check_constraint', code, constraint, table, column, detail, schema };
	}

	return { kind: 'unknown', code, constraint, table, column, detail, schema };
}

export class DrizzleQueryError extends Error {
	static readonly [entityKind]: string = 'DrizzleQueryError';

	public readonly kind!: DrizzleQueryErrorKind;
	public readonly code?: string | number;
	public readonly constraint?: string;
	public readonly table?: string;
	public readonly column?: string;
	public readonly detail?: string;
	public readonly schema?: string;

	constructor(
		public query: string,
		public params: any[],
		public override cause?: Error,
	) {
		const parsed = parseDatabaseError(cause);

		// If called as generic DrizzleQueryError, return specific subclass instance
		if (new.target === DrizzleQueryError) {
			if (parsed.kind === 'unique_constraint') {
				return new UniqueConstraintError(query, params, cause, parsed);
			}
			if (parsed.kind === 'foreign_key_constraint') {
				return new ForeignKeyConstraintError(query, params, cause, parsed);
			}
			if (parsed.kind === 'not_null_constraint') {
				return new NotNullConstraintError(query, params, cause, parsed);
			}
			if (parsed.kind === 'check_constraint') {
				return new CheckConstraintError(query, params, cause, parsed);
			}
		}

		super(`Failed query: ${query}\nparams: ${params}`);
		this.name = 'DrizzleQueryError';
		Error.captureStackTrace?.(this, DrizzleQueryError);

		if (cause) (this as any).cause = cause;

		this.kind = parsed.kind;
		this.code = parsed.code;
		this.constraint = parsed.constraint;
		this.table = parsed.table;
		this.column = parsed.column;
		this.detail = parsed.detail;
		this.schema = parsed.schema;
	}

	isUniqueConstraint(): this is UniqueConstraintError {
		return this.kind === 'unique_constraint';
	}

	isForeignKeyConstraint(): this is ForeignKeyConstraintError {
		return this.kind === 'foreign_key_constraint';
	}

	isNotNullConstraint(): this is NotNullConstraintError {
		return this.kind === 'not_null_constraint';
	}

	isCheckConstraint(): this is CheckConstraintError {
		return this.kind === 'check_constraint';
	}
}

export class UniqueConstraintError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'UniqueConstraintError';
	override readonly kind = 'unique_constraint' as const;

	constructor(query: string, params: any[], cause?: Error, parsed?: DrizzleQueryErrorInfo) {
		super(query, params, cause);
		this.name = 'UniqueConstraintError';
		if (parsed) {
			(this as any).code = parsed.code;
			(this as any).constraint = parsed.constraint;
			(this as any).table = parsed.table;
			(this as any).column = parsed.column;
			(this as any).detail = parsed.detail;
			(this as any).schema = parsed.schema;
		}
	}
}

export class ForeignKeyConstraintError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'ForeignKeyConstraintError';
	override readonly kind = 'foreign_key_constraint' as const;

	constructor(query: string, params: any[], cause?: Error, parsed?: DrizzleQueryErrorInfo) {
		super(query, params, cause);
		this.name = 'ForeignKeyConstraintError';
		if (parsed) {
			(this as any).code = parsed.code;
			(this as any).constraint = parsed.constraint;
			(this as any).table = parsed.table;
			(this as any).column = parsed.column;
			(this as any).detail = parsed.detail;
			(this as any).schema = parsed.schema;
		}
	}
}

export class NotNullConstraintError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'NotNullConstraintError';
	override readonly kind = 'not_null_constraint' as const;

	constructor(query: string, params: any[], cause?: Error, parsed?: DrizzleQueryErrorInfo) {
		super(query, params, cause);
		this.name = 'NotNullConstraintError';
		if (parsed) {
			(this as any).code = parsed.code;
			(this as any).constraint = parsed.constraint;
			(this as any).table = parsed.table;
			(this as any).column = parsed.column;
			(this as any).detail = parsed.detail;
			(this as any).schema = parsed.schema;
		}
	}
}

export class CheckConstraintError extends DrizzleQueryError {
	static override readonly [entityKind]: string = 'CheckConstraintError';
	override readonly kind = 'check_constraint' as const;

	constructor(query: string, params: any[], cause?: Error, parsed?: DrizzleQueryErrorInfo) {
		super(query, params, cause);
		this.name = 'CheckConstraintError';
		if (parsed) {
			(this as any).code = parsed.code;
			(this as any).constraint = parsed.constraint;
			(this as any).table = parsed.table;
			(this as any).column = parsed.column;
			(this as any).detail = parsed.detail;
			(this as any).schema = parsed.schema;
		}
	}
}

export function isUniqueConstraintError(error: unknown): error is UniqueConstraintError {
	return error instanceof DrizzleQueryError && error.kind === 'unique_constraint';
}

export function isForeignKeyConstraintError(error: unknown): error is ForeignKeyConstraintError {
	return error instanceof DrizzleQueryError && error.kind === 'foreign_key_constraint';
}

export function isNotNullConstraintError(error: unknown): error is NotNullConstraintError {
	return error instanceof DrizzleQueryError && error.kind === 'not_null_constraint';
}

export function isCheckConstraintError(error: unknown): error is CheckConstraintError {
	return error instanceof DrizzleQueryError && error.kind === 'check_constraint';
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}
