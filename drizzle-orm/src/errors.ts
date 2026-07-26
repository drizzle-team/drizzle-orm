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
		if (cause) (this as any).cause = cause;
	}
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}

// ---- New typed Postgres error classes ----

/**
 * Base class for all Postgres integrity constraint errors.
 * Exposes the raw postgres error fields.
 */
export class PostgresError extends DrizzleError {
	/** Postgres error code (e.g., '23505') */
	code: string;
	/** Name of the constraint that was violated (if any) */
	constraint?: string;
	/** Name of the table involved */
	table?: string;
	/** Name of the schema */
	schema?: string;
	/** Detail message from Postgres */
	detail?: string;
	/** Column name, if applicable */
	column?: string;

	constructor(cause: Error & { code?: string; constraint?: string; table?: string; schema?: string; detail?: string; column?: string }) {
		super({ message: cause.message, cause });
		this.name = 'PostgresError';
		this.code = cause.code ?? '';
		this.constraint = cause.constraint;
		this.table = cause.table;
		this.schema = cause.schema;
		this.detail = cause.detail;
		this.column = cause.column;
	}
}

export class UniqueConstraintError extends PostgresError {
	static override readonly [entityKind]: string = 'UniqueConstraintError';
	static readonly code = '23505';

	constructor(cause: Error & { code?: string; constraint?: string; table?: string; schema?: string; detail?: string; column?: string }) {
		super(cause);
		this.name = 'UniqueConstraintError';
	}
}

export class ForeignKeyViolationError extends PostgresError {
	static override readonly [entityKind]: string = 'ForeignKeyViolationError';
	static readonly code = '23503';

	constructor(cause: Error & { code?: string; constraint?: string; table?: string; schema?: string; detail?: string; column?: string }) {
		super(cause);
		this.name = 'ForeignKeyViolationError';
	}
}

export class NotNullViolationError extends PostgresError {
	static override readonly [entityKind]: string = 'NotNullViolationError';
	static readonly code = '23502';

	constructor(cause: Error & { code?: string; constraint?: string; table?: string; schema?: string; detail?: string; column?: string }) {
		super(cause);
		this.name = 'NotNullViolationError';
	}
}

export class CheckViolationError extends PostgresError {
	static override readonly [entityKind]: string = 'CheckViolationError';
	static readonly code = '23514';

	constructor(cause: Error & { code?: string; constraint?: string; table?: string; schema?: string; detail?: string; column?: string }) {
		super(cause);
		this.name = 'CheckViolationError';
	}
}

/**
 * Map a raw postgres error code to the appropriate Drizzle error class.
 * Returns the original error if no mapping exists.
 */
export function wrapPostgresError(error: Error): Error {
	const code = (error as any).code;
	if (!code) return error;

	switch (code) {
		case '23505': return new UniqueConstraintError(error as any);
		case '23503': return new ForeignKeyViolationError(error as any);
		case '23502': return new NotNullViolationError(error as any);
		case '23514': return new CheckViolationError(error as any);
		default: return error;
	}
}
