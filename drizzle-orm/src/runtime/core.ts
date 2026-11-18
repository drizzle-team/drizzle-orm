import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { type SpanName, tracer } from '~/tracing.ts';

/** Set of operations required to execute drizzle query in a runtime variant (sync, async, Effect) */
export interface QueryRuntime {
	/** Defer `body` execution; `body` may return a plain value or the runtime's own (Promise, Effect) */
	suspend(body: () => unknown): unknown;
	/** Chained execution: executes `next` with `first`'s returned data after `first` succeeds */
	chain(first: unknown, next: (value: any) => unknown): unknown;
	/**
	 * Run `body` without waiting for it if possible in runtime
	 *
	 * Used to avoid stalling queries while logger runs
	 */
	detach(body: () => unknown): unknown;
	/** Runs `run` (the driver call); it's failure, thrown or returned, fails with `onError`'s error instead */
	attempt(run: () => unknown, onError: (error: unknown) => unknown): unknown;
	/** Runs `body` in a tracing span */
	readonly span?: (name: SpanName, attributes: Record<string, string> | undefined, body: () => unknown) => unknown;
	/** Error wrapper */
	queryError(query: string, params: unknown[] | undefined, cause: unknown): unknown;
}

export const tracedSpan: NonNullable<QueryRuntime['span']> = (name, attributes, body) =>
	tracer.startActiveSpan(name, (span) => {
		if (attributes) span?.setAttributes(attributes);
		return body();
	});

/** Runs `body` in `runtime`'s tracing span, or just runs it on an untraced runtime */
export function withSpan(
	runtime: QueryRuntime,
	name: SpanName,
	attributes: Record<string, string> | undefined,
	body: () => unknown,
): unknown {
	return runtime.span ? runtime.span(name, attributes, body) : body();
}

/** Runtime-agnostic abstraction of query logger for {@link executePreparedQuery} */
export interface PreparedQueryLogger {
	logQuery(query: string, params: unknown[]): unknown;
}

/** Runtime-agnostic query execution flow */
export function executePreparedQuery(
	runtime: QueryRuntime,
	query: Query,
	logger: PreparedQueryLogger,
	paramsInErrors: boolean | undefined,
	placeholderValues: Record<string, unknown> | undefined,
	run: (params: unknown[]) => unknown,
	mapRows: ((rows: any) => unknown) | undefined,
): unknown {
	return runtime.suspend(() => {
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0 ? query.params : fillPlaceholders(query.params, placeholderValues ?? {});
		const onError = (e: unknown) => runtime.queryError(sql, paramsInErrors ? params : undefined, e);

		const span = runtime.span;
		if (!span) {
			return runtime.chain(runtime.detach(() => logger.logQuery(sql, params)), () => {
				const rows = runtime.attempt(() => run(params), onError);
				return mapRows ? runtime.chain(rows, mapRows) : rows;
			});
		}

		const attributes = {
			'drizzle.query.text': sql,
			'drizzle.query.params': JSON.stringify(params),
		};

		return span(
			'drizzle.execute',
			attributes,
			() =>
				runtime.chain(runtime.detach(() => logger.logQuery(sql, params)), () => {
					const rows = span(
						'drizzle.driver.execute',
						attributes,
						() => runtime.attempt(() => run(params), onError),
					);
					if (!mapRows) return rows;

					return runtime.chain(
						rows,
						(rows) => span('drizzle.mapResponse', undefined, () => runtime.suspend(() => mapRows(rows))),
					);
				}),
		);
	});
}

export type QueryProgram<A> = Generator<unknown, A, any>;

/** Waits for `value` in a {@link QueryProgram}: a plain value or Promise for async and sync runtimes, an Effect for the Effect one */
export function* perform<A>(value: unknown): QueryProgram<A> {
	return yield value;
}

/** Runs the program `body` creates on `runtime`, returning what the runtime runs */
export function runProgram<A>(runtime: QueryRuntime, body: () => QueryProgram<A>): unknown {
	return runtime.suspend(() => {
		const program = body();
		const step = (input?: unknown): unknown => {
			const next = program.next(input);
			return next.done ? next.value : runtime.chain(next.value, step);
		};
		return step();
	});
}
