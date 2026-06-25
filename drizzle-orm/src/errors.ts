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
		// when true, param values are redacted so they don't leak into error reporting
		maskParams = false,
	) {
		super(`Failed query: ${query}\nparams: ${maskParams ? params.map(() => '?') : params}`);
		this.name = 'DrizzleQueryError';
		// redact the public field too, preserving arity so the param count stays visible
		if (maskParams) this.params = params.map(() => '?');
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
