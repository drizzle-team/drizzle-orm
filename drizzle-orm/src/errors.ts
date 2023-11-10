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
	static readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}
