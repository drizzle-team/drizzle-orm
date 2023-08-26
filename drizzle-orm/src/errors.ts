import { entityKind } from '~/entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor(message: string) {
		super(message);
		this.name = 'DrizzleError';
	}

	static wrap(error: unknown, message?: string): DrizzleError {
		return error instanceof Error // eslint-disable-line no-instanceof/no-instanceof
			? new DrizzleError(message ? `${message}: ${error.message}` : error.message)
			: new DrizzleError(message ?? String(error));
	}
}

export class TransactionRollbackError extends DrizzleError {
	static readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super('Rollback');
	}
}
