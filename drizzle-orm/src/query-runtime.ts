import { DrizzleQueryError } from '~/errors.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { hasTelemetry, type SpanName, tracer } from '~/tracing.ts';

/**
 * @internal
 * How a runtime composes the steps of running a query, so that prepared queries, sessions and builders are written
 * once for every runtime: the async runtime composes Promises (and plain values), the sync one plain values, the
 * Effect one (`~/effect-core/query-runtime.ts`) Effects.
 * Every method takes and returns what the runtime runs
 */
export interface QueryRuntime {
	/** Defers `body` to when the result runs: what it throws becomes the result's failure */
	suspend(body: () => unknown): unknown;
	/** Runs `next` with what `first` gives: a logger call's result, a query's rows */
	andThen(first: unknown, next: (value: any) => unknown): unknown;
	/**
	 * Runs the query (`run` calls the driver) and passes it's rows through `onRows`; a failure of the query itself,
	 * thrown or returned, fails with `onError`'s error instead
	 */
	transform(
		run: () => unknown,
		onRows: ((rows: any) => unknown) | undefined,
		onError: (error: unknown) => unknown,
	): unknown;
	/** A value computed when the result runs */
	sync(body: () => unknown): unknown;
	/** Runs `body` in a tracing span; just `body` while telemetry is off */
	span(name: SpanName, attributes: Record<string, string> | undefined, body: () => unknown): unknown;
	/** The error that a failed query fails with */
	queryError(query: string, params: unknown[] | undefined, cause: unknown): unknown;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
	value !== null && typeof value === 'object' && typeof (value as PromiseLike<unknown>).then === 'function';

const queryError = (query: string, params: unknown[] | undefined, cause: unknown) =>
	new DrizzleQueryError(query, params, cause as Error);

const span: QueryRuntime['span'] = (name, attributes, body) =>
	tracer.startActiveSpan(name, (span) => {
		if (attributes) span?.setAttributes(attributes);
		return body();
	});

/** @internal Promises: failures reject with a `DrizzleQueryError` */
export const asyncQueryRuntime: QueryRuntime = {
	suspend(body) {
		try {
			return body();
		} catch (e) {
			return Promise.reject(e);
		}
	},
	andThen: (first, next) => isThenable(first) ? first.then(next) : next(first),
	transform(run, onRows, onError) {
		let query: Promise<unknown>;
		try {
			query = run() as Promise<unknown>;
		} catch (e) {
			return Promise.reject(onError(e));
		}
		return query.then(onRows, (e) => {
			throw onError(e);
		});
	},
	sync: (body) => body(),
	span,
	queryError,
};

/** @internal Plain values, for drivers that run queries synchronously: failures throw a `DrizzleQueryError` */
export const syncQueryRuntime: QueryRuntime = {
	suspend: (body) => body(),
	andThen: (first, next) => next(first),
	transform(run, onRows, onError) {
		let rows: unknown;
		try {
			rows = run();
		} catch (e) {
			throw onError(e);
		}
		return onRows ? onRows(rows) : rows;
	},
	sync: (body) => body(),
	span,
	queryError,
};

/** @internal What a prepared query logs it's queries with: a `Logger`, or an Effect logger whose `logQuery` is an Effect */
export interface PreparedQueryLogger {
	logQuery(query: string, params: unknown[]): unknown;
}

/**
 * @internal
 * Runs a prepared query on `runtime`, the same for every dialect and runtime: fills the placeholders, logs the query,
 * runs it with `run` (the driver call) and maps it's rows with `mapRows`. A failure of the query fails with the
 * runtime's query error (`DrizzleQueryError` / `EffectDrizzleQueryError`). Traced while telemetry is on
 */
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

		if (!hasTelemetry) {
			return runtime.andThen(
				logger.logQuery(sql, params),
				() => runtime.transform(() => run(params), mapRows, onError),
			);
		}

		const attributes = {
			'drizzle.query.text': sql,
			'drizzle.query.params': JSON.stringify(params),
		};

		return runtime.span('drizzle.execute', attributes, () =>
			runtime.andThen(logger.logQuery(sql, params), () => {
				const rows = runtime.span(
					'drizzle.driver.execute',
					attributes,
					() => runtime.transform(() => run(params), undefined, onError),
				);
				if (!mapRows) return rows;

				return runtime.andThen(
					rows,
					(rows) => runtime.span('drizzle.mapResponse', undefined, () => runtime.sync(() => mapRows(rows))),
				);
			}));
	});
}
