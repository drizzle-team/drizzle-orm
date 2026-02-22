import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { applyMixins, type NeonAuthToken } from '~/utils.ts';
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
	override _prepare(name?: string): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		const { query, builtQuery } = this._toSQL();

		const mapperResult = this.rowMapperGenerator(query.selection, this.parseJson);
		const mapRows = mapperResult.mapper;
		const isArrayMode = mapperResult.isArrayMode;
		const mode = this.mode;

		return this.session.prepareRelationalQuery<PreparedQueryConfig & { execute: TResult }>(
			builtQuery,
			undefined,
			name,
			(rawRows: unknown[][] | Record<string, unknown>[]) => {
				const rows = mapRows(rawRows as any) as TResult[];
				if (mode === 'first') {
					return rows[0] as TResult;
				}
				return rows as TResult;
			},
			isArrayMode,
		).setToken(this.authToken);
	}

	override prepare(name: string): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name);
	}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return this._prepare().execute(placeholderValues);
	}
}

applyMixins(PgAsyncRelationalQuery, [QueryPromise]);
