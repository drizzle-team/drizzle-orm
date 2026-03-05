import { entityKind } from '~/entity.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import { QueryPromise } from '~/query-promise.ts';
import { mapRelationalRow } from '~/relations.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { tracer } from '~/tracing.ts';
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
	_prepare(name?: string, generateName = false): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { query, builtQuery } = this._toSQL();

			return this.session.prepareRelationalQuery<PreparedQueryConfig & { execute: TResult }>(
				builtQuery,
				undefined,
				name ?? (generateName ? preparedStatementName(builtQuery.sql, builtQuery.params) : name),
				(rows, mapColumnValue) => {
					for (let i = 0; i < rows.length; ++i) {
						mapRelationalRow(
							rows[i]!,
							query.selection,
							mapColumnValue,
							this.parseJson,
							undefined,
							false,
						);
					}

					if (this.mode === 'first') {
						return rows[0] as TResult;
					}
					return rows as TResult;
				},
				{
					isFirst: this.mode === 'first',
					parseJson: this.parseJson,
					parseJsonIfString: false,
					rootJsonMappers: false,
					selection: query.selection,
				},
			).setToken(this.authToken);
		});
	}

	prepare(name?: string): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name, true);
	}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	}
}

applyMixins(PgAsyncRelationalQuery, [QueryPromise]);
