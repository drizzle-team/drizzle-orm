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
	_prepare(name?: string, generateName = false): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const { dialect } = this;
			const isFirst = this.mode === 'first';

			const { query, builtQuery } = this._toSQL();
			const shape = dialect.shapeGenerator?.(
				{ type: 'relational', fields: query.selection },
				undefined,
			);

			const mapper = shape
				? (isFirst ? (rows: any[]) => rows[0] : undefined)
				: dialect.mapperGenerators.relationalRows({
					isFirst,
					parseJson: this.parseJson,
					parseJsonIfString: false,
					rootJsonMappers: false,
					selection: query.selection,
					arrayModeRoot: true,
				});

			return this.session.prepareQuery<PreparedQueryConfig & { execute: TResult }>(
				builtQuery,
				shape ? 'objects' : 'arrays',
				name ?? generateName,
				mapper,
				// TODO: implement cache
				undefined,
				undefined,
				shape,
			);
		});
	}

	prepare(name?: string): PgAsyncPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name, true);
	}

	execute(placeholderValues?: Record<string, unknown>): Promise<TResult> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	}
}

applyMixins(PgAsyncRelationalQuery, [QueryPromise]);
