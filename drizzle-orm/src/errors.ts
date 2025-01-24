import { entityKind } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor(message?: string, readonly details?: Record<string, any>) {
		super({ message: `Rollback${message ? `: ${message}` : ''}` });
		this.name = 'TransactionRollbackError';
	}
}
