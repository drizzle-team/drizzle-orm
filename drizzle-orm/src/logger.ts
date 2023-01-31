export interface Logger {
	logQuery(query: string, params: unknown[]): void;
}

export interface LogWriter {
	write(message: string): void;
}

export class ConsoleLogWriter implements LogWriter {
	write(message: string) {
		console.log(message);
	}
}

export class DefaultLogger implements Logger {
	readonly writer: LogWriter;

	constructor(config: { writer: LogWriter } = { writer: new ConsoleLogWriter() }) {
		this.writer = config.writer;
	}

	logQuery(query: string, params: unknown[]): void {
		const stringifiedParams = params.map((p) => {
			try {
				return JSON.stringify(p);
			} catch (e) {
				return String(p);
			}
		});
		const paramsStr = stringifiedParams.length ? ` -- params: [${stringifiedParams.join(', ')}]` : '';
		this.writer.write(`Query: ${query}${paramsStr}`);
	}
}

export class NoopLogger implements Logger {
	logQuery(): void {}
}
