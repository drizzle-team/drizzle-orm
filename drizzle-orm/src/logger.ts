import { entityKind } from '~/entity.ts';

export interface LogQueryOptions  {
	duration?: number | undefined;
	failed?: boolean;
}

export interface Logger {
	logQuery(query: string, params: unknown[], options?: LogQueryOptions): void;
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

export class DefaultLogger implements Logger {
	static readonly [entityKind]: string = 'DefaultLogger';

	readonly writer: LogWriter;

	constructor(config?: { writer: LogWriter }) {
		this.writer = config?.writer ?? new ConsoleLogWriter();
	}

	logQuery(query: string, params: unknown[], options: LogQueryOptions = {}): void {
		const { duration, failed } = options;
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
		this.writer.write(`${openingStr}${durationStr}: ${query}${paramsStr}`);
	}
}

export class NoopLogger implements Logger {
	static readonly [entityKind]: string = 'NoopLogger';

	logQuery(): void {
		// noop
	}
}
