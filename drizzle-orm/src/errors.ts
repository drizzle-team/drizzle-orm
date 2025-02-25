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

	constructor() {
		super({ message: 'Rollback' });
	}
}

export async function wrapPromiseCaptureStacktrace<R>(promise: PromiseLike<R>): Promise<R> {
	try {
		return await promise;
	} catch (e) {
		Error.captureStackTrace(e as any, wrapPromiseCaptureStacktrace);
		throw e;
	}
}
