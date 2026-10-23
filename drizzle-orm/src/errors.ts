import { entityKind, is } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	static override [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export class DrizzleQueryError extends Error {
	static readonly [entityKind]: string = 'DrizzleQueryError';

	static override [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		public query: string,
		public params: any[] | undefined,
		public override cause?: Error,
	) {
		super(params ? `Failed query: ${query}\nparams: ${params}` : `Failed query: ${query}`);
		this.name = 'DrizzleQueryError';
		Error.captureStackTrace(this, DrizzleQueryError);

		// ES2022+: preserves original error on `.cause`
		if (cause) (this as any).cause = cause;
	}
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
		this.name = 'TransactionRollbackError';
	}
}
