import { entityKind, is } from './entity.ts';
import { TransactionRollbackError } from './errors';
import type { Logger } from './logger.ts';
import type { Query } from './sql/sql.ts';

export abstract class DrizzleTracer {
	static readonly [entityKind]: string = 'DrizzleTracer';

	static handleQueryError: (err: unknown, queryString: string, queryParams: any[], duration: number) => never;

	static handleTransactionError: (
		err: unknown,
		transactionId: string,
		type: 'transaction' | 'savepoint',
		duration: number,
	) => never;

	static generateTransactionName(): string {
		return Math.random().toString(16).substring(2, 6);
	}

	static async traceQuery<T>(
		query: Promise<T>,
		logger: Logger,
		queryString: string,
		queryParams: any[],
	): Promise<T> {
		const start = performance.now();
		const transaction = logger.transaction;

		try {
			const result = await query;
			const duration = performance.now() - start;
			logger.logQuery(queryString, queryParams, { duration, transaction });
			return result;
		} catch (err) {
			const duration = performance.now() - start;
			logger.logQuery(queryString, queryParams, { duration, transaction, failed: true });
			throw this.handleQueryError(err, queryString, queryParams, duration);
		}
	}

	static async traceTransaction<T>(
		transaction: Promise<T>,
		logger: Logger,
		transactionName: string,
		type: 'transaction' | 'savepoint',
	): Promise<T> {
		const start = performance.now();
		logger.logTransactionBegin(transactionName, type);

		try {
			const result = await transaction;
			const duration = performance.now() - start;
			logger.logTransactionEnd(transactionName, type, { duration, status: 'commit' });
			return result;
		} catch (err) {
			const duration = performance.now() - start;
			const status = is(err, TransactionRollbackError) ? 'rollback' : 'error';
			logger.logTransactionEnd(transactionName, type, { duration, status });
			throw this.handleTransactionError(err, transactionName, type, duration);
		}
	}
}

export interface TracedQuery extends Query {
	duration?: number;
}

export interface TracedTransaction {
	name: string;
	type: 'transaction' | 'savepoint';
	duration?: number;
}
