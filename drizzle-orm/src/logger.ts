import { entityKind } from '~/entity.ts';

export interface LogQueryOptions {
	transaction?: {
		name: string;
		type: 'transaction' | 'savepoint';
	};
	duration?: number | undefined;
	failed?: boolean;
}

export interface LogTransactionEndOptions {
	duration?: number | undefined;
	status?: 'commit' | 'rollback' | 'error';
}

export abstract class Logger {
	/** @internal */
	transaction?: LogQueryOptions['transaction'];

	/** @internal */
	setTransactionDetails(details: LogQueryOptions['transaction']): void {
		this.transaction = details;
	}

	abstract logQuery(query: string, params: unknown[], options?: LogQueryOptions): void;
	abstract logTransactionBegin(name: string, type: 'transaction' | 'savepoint'): void;
	abstract logTransactionEnd(name: string, type: 'transaction' | 'savepoint', options?: LogTransactionEndOptions): void;
}

export interface LogWriter {
	write(message: string): void;
}

export class ConsoleLogWriter implements LogWriter {
	static readonly [entityKind]: string = 'ConsoleLogWriter';

	write(message: string) {
		console.log(message);
	}
}

export class DefaultLogger extends Logger {
	static readonly [entityKind]: string = 'DefaultLogger';

	readonly writer: LogWriter;

	constructor(config?: { writer: LogWriter }) {
		super();
		this.writer = config?.writer ?? new ConsoleLogWriter();
	}

	logQuery(query: string, params: unknown[], options: LogQueryOptions = {}): void {
		const { duration, failed, transaction } = options;
		const stringifiedParams = params.map((p) => {
			try {
				return JSON.stringify(p);
			} catch {
				return String(p);
			}
		});
		const paramsStr = stringifiedParams.length ? ` -- params: [${stringifiedParams.join(', ')}]` : '';
		const durationStr = duration ? ` [${Math.round(duration)}ms]` : '';
		const openingStr = failed ? 'Failed query' : 'Query';
		const transactionStr = transaction ? ` in ${transaction.type} ${transaction.name}` : '';
		this.writer.write(`${openingStr}${transactionStr}${durationStr}: ${query}${paramsStr}`);
	}

	logTransactionBegin(name: string, type: 'transaction' | 'savepoint'): void {
		this.writer.write(`Begin ${type} ${name}`);
	}

	logTransactionEnd(name: string, type: 'transaction' | 'savepoint', options?: LogTransactionEndOptions): void {
		const { duration, status } = options ?? {};
		const statusStr = status === 'commit' ? 'Commit' : status === 'rollback' ? 'Rollback' : 'Failed';
		const durationStr = duration ? ` [${Math.round(duration)}ms]` : '';
		this.writer.write(`${statusStr} ${type} ${name}${durationStr}`);
	}
}

export class NoopLogger extends Logger {
	static readonly [entityKind]: string = 'NoopLogger';

	logQuery(): void {
		// noop
	}

	logTransactionBegin(): void {
		// noop
	}

	logTransactionEnd(): void {
		// noop
	}
}
