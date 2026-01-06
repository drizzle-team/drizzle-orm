import { applyEffectWrapper, type QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import { mapRelationalRow } from '~/relations.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { tracer } from '~/tracing.ts';
import { PgRelationalQuery, type PgRelationalQueryHKTBase } from '../query-builders/query.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

export type AnyPgEffectRelationalQuery = PgEffectRelationalQuery<any>;

export interface PgEffectRelationalQueryHKT extends PgRelationalQueryHKTBase {
	_type: PgEffectRelationalQuery<this['result']>;
}

export interface PgEffectRelationalQuery<TResult> extends QueryEffect<TResult> {}
export class PgEffectRelationalQuery<TResult> extends PgRelationalQuery<PgEffectRelationalQueryHKT, TResult>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRelationalQueryV2';

	declare protected session: PgEffectSession;

	/** @internal */
	_prepare(name?: string): PgEffectPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { query, builtQuery } = this._toSQL();

			return this.session.prepareRelationalQuery<PreparedQueryConfig & { execute: TResult }>(
				builtQuery,
				undefined,
				name,
				(rawRows, mapColumnValue) => {
					const rows = rawRows.map((row) => mapRelationalRow(row, query.selection, mapColumnValue, this.parseJson));
					if (this.mode === 'first') {
						return rows[0] as TResult;
					}
					return rows as TResult;
				},
			);
		});
	}

	prepare(name: string): PgEffectPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this._prepare().execute(placeholderValues);
	}
}

applyEffectWrapper(PgEffectRelationalQuery);
