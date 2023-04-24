export class DrizzleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DrizzleError';
	}

	static wrap(error: unknown, message?: string): DrizzleError {
		return error instanceof Error
			? new DrizzleError(message ? `${message}: ${error.message}` : error.message)
			: new DrizzleError(message ?? String(error));
	}
}

export class TransactionRollbackError extends DrizzleError {
	constructor() {
		super('Rollback');
	}
}
