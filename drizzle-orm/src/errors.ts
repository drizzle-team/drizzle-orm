export class DrizzleError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'DrizzleError';
	}

	static wrap(error: unknown, message?: string): DrizzleError {
		return error instanceof Error
			? new DrizzleError(message ? `${message}: ${error.message}` : error.message, { cause: error })
			: new DrizzleError(message ?? String(error));
	}
}

export class TransactionRollbackError extends DrizzleError {
	constructor() {
		super('Rollback');
	}
}
