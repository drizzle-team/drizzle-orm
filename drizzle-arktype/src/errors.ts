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

export class SchemaValidationError extends DrizzleError {
	static override readonly [entityKind]: string = 'SchemaValidationError';

	constructor(
		public schemaName: string,
		public errors: Record<string, string>,
	) {
		super({
			message: `Schema validation failed for ${schemaName}: ${Object.entries(errors)
				.map(([key, error]) => `${key}: ${error}`)
				.join(', ')}`,
		});
		Error.captureStackTrace(this, SchemaValidationError);
	}
}

export class ColumnConversionError extends DrizzleError {
	static override readonly [entityKind]: string = 'ColumnConversionError';

	constructor(
		public columnName: string,
		public columnType: string,
		public cause?: unknown,
	) {
		super({
			message: `Failed to convert column ${columnName} of type ${columnType}`,
			cause,
		});
		Error.captureStackTrace(this, ColumnConversionError);
	}
}