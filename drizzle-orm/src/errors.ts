import { entityKind } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export type DrizzleQueryErrorType = 'unique' | 'not_null' | 'foreign_key' | 'check';

export interface DrizzleQueryErrorMetadata {
	type?: DrizzleQueryErrorType;
	code?: string | number;
	table?: string;
	column?: string;
	constraint?: string;
}

type DriverError = Error & {
	code?: string | number;
	errno?: number;
	errcode?: number;
	sqlState?: string;
	table?: string;
	tableName?: string;
	column?: string;
	columnName?: string;
	constraint?: string;
	constraintName?: string;
};

function classifyDriverError(error: DriverError): DrizzleQueryErrorType | undefined {
	const codes = new Set(
		[error.code, error.errno, error.errcode, error.sqlState]
			.filter((value): value is string | number => value !== undefined)
			.map(String),
	);

	if (
		codes.has('23505')
		|| codes.has('1062')
		|| codes.has('2067')
		|| codes.has('1555')
		|| codes.has('SQLITE_CONSTRAINT_UNIQUE')
		|| codes.has('SQLITE_CONSTRAINT_PRIMARYKEY')
	) {
		return 'unique';
	}
	if (
		codes.has('23502')
		|| codes.has('1048')
		|| codes.has('1299')
		|| codes.has('SQLITE_CONSTRAINT_NOTNULL')
	) {
		return 'not_null';
	}
	if (
		codes.has('23503')
		|| codes.has('1451')
		|| codes.has('1452')
		|| codes.has('1216')
		|| codes.has('1217')
		|| codes.has('787')
		|| codes.has('SQLITE_CONSTRAINT_FOREIGNKEY')
	) {
		return 'foreign_key';
	}
	if (
		codes.has('23514')
		|| codes.has('3819')
		|| codes.has('275')
		|| codes.has('SQLITE_CONSTRAINT_CHECK')
	) {
		return 'check';
	}

	return undefined;
}

function parseConstraintLocation(message: string): Pick<DrizzleQueryErrorMetadata, 'table' | 'column'> {
	const sqlite = /constraint failed:\s*([^\s.]+)\.([^\s,]+)/i.exec(message);
	if (sqlite) {
		return { table: sqlite[1], column: sqlite[2] };
	}
	return {};
}

function getDriverErrorMetadata(cause: Error | undefined): DrizzleQueryErrorMetadata {
	if (!cause || typeof cause !== 'object') return {};

	const error = cause as DriverError;
	const location = parseConstraintLocation(error.message ?? '');
	return {
		type: classifyDriverError(error),
		code: error.code ?? error.errno ?? error.errcode ?? error.sqlState,
		table: error.table ?? error.tableName ?? location.table,
		column: error.column ?? error.columnName ?? location.column,
		constraint: error.constraint ?? error.constraintName,
	};
}

export class DrizzleQueryError extends Error {
	static readonly [entityKind]: string = 'DrizzleQueryError';

	readonly type?: DrizzleQueryErrorType;
	readonly code?: string | number;
	readonly table?: string;
	readonly column?: string;
	readonly constraint?: string;

	constructor(
		public query: string,
		public params: any[],
		public override cause?: Error,
	) {
		super(`Failed query: ${query}\nparams: ${params}`);
		this.name = 'DrizzleQueryError';
		Error.captureStackTrace(this, DrizzleQueryError);

		const metadata = getDriverErrorMetadata(cause);
		this.type = metadata.type;
		this.code = metadata.code;
		this.table = metadata.table;
		this.column = metadata.column;
		this.constraint = metadata.constraint;

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
