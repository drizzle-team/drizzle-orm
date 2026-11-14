import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins } from '~/utils.ts';
import { PgRelationalQuery, type PgRelationalQueryHKTBase } from '../query-builders/query.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgAsyncPreparedQuery, PgAsyncSession } from './session.ts';

export type AnyPgAsyncRelationalQuery = PgAsyncRelationalQuery<any>;

export interface PgAsyncRelationalQueryHKT extends PgRelationalQueryHKTBase {
	_type: PgAsyncRelationalQuery<this['result']>;
}

export interface PgAsyncRelationalQuery<TResult> extends QueryPromise<TResult> {}
export class PgAsyncRelationalQuery<TResult> extends PgRelationalQuery<PgAsyncRelationalQueryHKT, TResult>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgAsyncRelationalQueryV2';

	declare protected session: PgAsyncSession;

	/** @internal */
	override _prepare(
		name?: string,
		generateName = false,
	): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return super._prepare(name, generateName) as PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }>;
	}

	prepare(name?: string): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name, true);
	}

	/**
	 * Runs the query and returns a Promise of the result, with values for any `sql.placeholder()` it contains.
	 *
	 * Eager: the query is sent as soon as `execute` is called, whether or not the Promise is awaited. The builder
	 * itself is lazy: awaiting it runs it the same way, and passing it to a batch runs it there instead.
	 */
	execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	}
}

applyMixins(PgAsyncRelationalQuery, [QueryPromise]);
