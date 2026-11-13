import { entityKind } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export class DrizzleQueryError extends DrizzleError {
	static override readonly [entityKind]: string = 'DrizzleQueryError';

	constructor(
		public query: string,
		public params: any[],
		public override cause?: unknown,
	) {
		super({ message: `Failed query: ${query}\nparams: ${params}`, cause });
		this.name = 'DrizzleQueryError';
		Error.captureStackTrace(this, DrizzleQueryError);
	}
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}
