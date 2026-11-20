/**
 * How a runtime wraps what a builder runs: a builder's HKT (or the builder itself) carries one, and the common builder
 * types it's `prepare` and `execute` through it. `result` is the query's result; the runtime gives the types built
 * from it. Shared by every dialect: each runtime of a dialect fills it with it's own prepared query
 */
export interface QueryRuntimeHKT {
	readonly result: unknown;
	/** What `execute` returns: a Promise of the result, an Effect of it */
	readonly execute: unknown;
	/** What `prepare` returns: the runtime's prepared query of the result */
	readonly prepared: unknown;
}

export type QueryRuntimeKind<TRuntime extends QueryRuntimeHKT, TResult> = TRuntime & { readonly result: TResult };
