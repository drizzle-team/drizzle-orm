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

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}

export type ConstraintErrorType = 'unique' | 'not_null' | 'foreign_key' | 'check' | 'unknown';

export interface ConstraintErrorParams {
	message?: string;
	cause?: unknown;
	type?: ConstraintErrorType;
	table?: string;
	column?: string;
	constraint?: string;
	detail?: string;
	code?: string | number;
}

export class DrizzleConstraintError extends DrizzleError {
	static override readonly [entityKind]: string = 'DrizzleConstraintError';

	readonly type: ConstraintErrorType;
	readonly table?: string;
	readonly column?: string;
	readonly constraint?: string;
	readonly detail?: string;
	readonly code?: string | number;

	constructor({
		message,
		cause,
		type = 'unknown',
		table,
		column,
		constraint,
		detail,
		code,
	}: ConstraintErrorParams) {
		super({ message, cause });
		this.name = 'DrizzleConstraintError';
		this.type = type;
		this.table = table;
		this.column = column;
		this.constraint = constraint;
		this.detail = detail;
		this.code = code;
	}
}

export class UniqueConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'UniqueConstraintError';

	constructor(params: Omit<ConstraintErrorParams, 'type'>) {
		super({ ...params, type: 'unique' });
		this.name = 'UniqueConstraintError';
	}
}

export class NotNullConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'NotNullConstraintError';

	constructor(params: Omit<ConstraintErrorParams, 'type'>) {
		super({ ...params, type: 'not_null' });
		this.name = 'NotNullConstraintError';
	}
}

export class ForeignKeyConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'ForeignKeyConstraintError';

	constructor(params: Omit<ConstraintErrorParams, 'type'>) {
		super({ ...params, type: 'foreign_key' });
		this.name = 'ForeignKeyConstraintError';
	}
}

export class CheckConstraintError extends DrizzleConstraintError {
	static override readonly [entityKind]: string = 'CheckConstraintError';

	constructor(params: Omit<ConstraintErrorParams, 'type'>) {
		super({ ...params, type: 'check' });
		this.name = 'CheckConstraintError';
	}
}

export function mapDriverError(error: unknown): DrizzleError {
	if (error instanceof DrizzleError) {
		return error;
	}

	const err = (error && typeof error === 'object' ? error : {}) as Record<string, any>;
	const message: string = typeof err.message === 'string' ? err.message : String(error ?? '');
	const code: string | number | undefined = err.code ?? err.errno;
	const codeStr = String(code ?? '');

	let table: string | undefined = typeof err.table === 'string' ? err.table : undefined;
	let column: string | undefined = typeof err.column === 'string' ? err.column : undefined;
	let constraint: string | undefined = typeof err.constraint === 'string' ? err.constraint : undefined;
	const detail: string | undefined = typeof err.detail === 'string' ? err.detail : undefined;

	// 1. PostgreSQL Error Mapping
	// Codes: 23505 (unique), 23502 (not_null), 23503 (foreign_key), 23514 (check)
	if (codeStr === '23505' || (!codeStr && /duplicate key value violates unique constraint/i.test(message))) {
		if (detail) {
			const colMatch = detail.match(/Key \(([^)]+)\)=/);
			if (colMatch && !column) {
				column = colMatch[1];
			}
		}
		if (!constraint) {
			const constraintMatch = message.match(/violates unique constraint "([^"]+)"/i);
			if (constraintMatch) constraint = constraintMatch[1];
		}
		return new UniqueConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (codeStr === '23502' || (!codeStr && /null value in column "([^"]+)" violates not-null constraint/i.test(message))) {
		if (!column) {
			const colMatch = message.match(/column "([^"]+)" violates not-null constraint/i);
			if (colMatch) column = colMatch[1];
		}
		if (!table && typeof err.table === 'string') {
			table = err.table;
		} else if (!table) {
			const tableMatch = message.match(/relation "([^"]+)"/i);
			if (tableMatch) table = tableMatch[1];
		}
		return new NotNullConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (codeStr === '23503' || (!codeStr && /violates foreign key constraint/i.test(message))) {
		if (detail) {
			const colMatch = detail.match(/Key \(([^)]+)\)=/);
			if (colMatch && !column) column = colMatch[1];
			const tableMatch = detail.match(/is not present in table "([^"]+)"/);
			if (tableMatch && !table) table = tableMatch[1];
		}
		if (!constraint) {
			const constraintMatch = message.match(/violates foreign key constraint "([^"]+)"/i);
			if (constraintMatch) constraint = constraintMatch[1];
		}
		return new ForeignKeyConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (codeStr === '23514' || (!codeStr && /violates check constraint/i.test(message))) {
		if (!constraint) {
			const constraintMatch = message.match(/violates check constraint "([^"]+)"/i);
			if (constraintMatch) constraint = constraintMatch[1];
		}
		return new CheckConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	// 2. MySQL Error Mapping
	// Codes: 1062 / ER_DUP_ENTRY (unique), 1048 / ER_BAD_NULL_ERROR (not_null), 1452 / 1216 / 1217 / ER_NO_REFERENCED_ROW_2 (foreign_key), 3819 / ER_CHECK_CONSTRAINT_VIOLATED (check)
	if (codeStr === '1062' || codeStr === 'ER_DUP_ENTRY' || /Duplicate entry .* for key/i.test(message)) {
		const keyMatch = message.match(/Duplicate entry '(?:.*?)' for key '([^']+)'/i);
		if (keyMatch) {
			const key = keyMatch[1]!;
			if (key.includes('.')) {
				const parts = key.split('.');
				if (!table) table = parts[0];
				if (!constraint) constraint = parts.slice(1).join('.');
			} else {
				if (!constraint) constraint = key;
			}
		}
		return new UniqueConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (codeStr === '1048' || codeStr === 'ER_BAD_NULL_ERROR' || /Column '([^']+)' cannot be null/i.test(message)) {
		const colMatch = message.match(/Column '([^']+)' cannot be null/i);
		if (colMatch && !column) {
			column = colMatch[1];
		}
		return new NotNullConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (
		codeStr === '1452' ||
		codeStr === '1216' ||
		codeStr === '1217' ||
		codeStr === 'ER_NO_REFERENCED_ROW_2' ||
		codeStr === 'ER_NO_REFERENCED_ROW' ||
		codeStr === 'ER_ROW_IS_REFERENCED_2' ||
		/foreign key constraint fails/i.test(message)
	) {
		const tableMatch = message.match(/fails \(`?(?:[^`.]+`?\.)?`?([^`]+)`?,/i);
		if (tableMatch && !table) table = tableMatch[1];

		const constraintMatch = message.match(/CONSTRAINT `([^`]+)`/i) || message.match(/CONSTRAINT ([^\s,`]+)/i);
		if (constraintMatch && !constraint && constraintMatch[1]!.toLowerCase() !== 'fails') {
			constraint = constraintMatch[1];
		}

		const colMatch = message.match(/FOREIGN KEY \(`?([^` )]+)`?\)/i);
		if (colMatch && !column) column = colMatch[1];

		return new ForeignKeyConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (
		codeStr === '3819' ||
		codeStr === 'ER_CHECK_CONSTRAINT_VIOLATED' ||
		/Check constraint '([^']+)' is violated/i.test(message)
	) {
		const constraintMatch = message.match(/Check constraint '([^']+)' is violated/i);
		if (constraintMatch && !constraint) constraint = constraintMatch[1];
		return new CheckConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	// 3. SQLite Error Mapping
	if (/UNIQUE constraint failed/i.test(message)) {
		const match = message.match(/UNIQUE constraint failed:\s*([^,\s]+)(?:,\s*([^\s]+))?/i);
		if (match) {
			const target = match[1]!;
			if (target.includes('.')) {
				const [tbl, col] = target.split('.');
				if (!table) table = tbl;
				if (!column) column = col;
			} else {
				if (!column) column = target;
			}
		}
		return new UniqueConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (/NOT NULL constraint failed/i.test(message)) {
		const match = message.match(/NOT NULL constraint failed:\s*([^,\s]+)/i);
		if (match) {
			const target = match[1]!;
			if (target.includes('.')) {
				const [tbl, col] = target.split('.');
				if (!table) table = tbl;
				if (!column) column = col;
			} else {
				if (!column) column = target;
			}
		}
		return new NotNullConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (/FOREIGN KEY constraint failed/i.test(message)) {
		return new ForeignKeyConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	if (/CHECK constraint failed/i.test(message)) {
		const match = message.match(/CHECK constraint failed:\s*([^\s]+)/i);
		if (match && !constraint) constraint = match[1];
		return new CheckConstraintError({ message, cause: error, table, column, constraint, detail, code });
	}

	// 4. Fallback / Passthrough
	return new DrizzleError({ message, cause: error });
}
