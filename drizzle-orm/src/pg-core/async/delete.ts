import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { applyMixins, type Assume, makeJitQueryMapper, mapResultRow } from '~/utils.ts';
import { PgDeleteBase, type PgDeleteHKTBase } from '../query-builders/delete.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgAsyncPreparedQuery, PgAsyncSession } from './session.ts';

export type PgAsyncDelete<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgAsyncDeleteBase<TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export type PgAsyncDeletePrepare<T extends AnyAsyncPgDelete> = PgAsyncPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type AnyAsyncPgDelete = PgAsyncDeleteBase<any, any, any, any, any, any>;

export interface PgAsyncDeleteHKT extends PgDeleteHKTBase {
	_type: PgAsyncDeleteBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		Assume<this['selectedFields'], ColumnsSelection | undefined>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export interface PgAsyncDeleteBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]> {}

export class PgAsyncDeleteBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends PgDeleteBase<PgAsyncDeleteHKT, TTable, TQueryResult, TSelectedFields, TReturning, TDynamic, TExcludedMethods>
	implements
		TypedQueryBuilder<
			TSelectedFields,
			TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]
		>,
		RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'PgAsyncDelete';

	declare protected session: PgAsyncSession;

	/** @internal */
	_prepare(name?: string, generateName = false): PgAsyncDeletePrepare<this> {
		const { session, config, dialect, cacheConfig } = this;
		const { returning: fields } = config;

		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			const query = dialect.sqlToQuery(this.getSQL());
			const mapper = fields
				? this.dialect.useJitMappers ? makeJitQueryMapper(fields, undefined) : (rows: any[]) => {
					return rows.map((it) => {
						return mapResultRow(fields, it, undefined);
					});
				}
				: undefined;

			const preparedQuery = session.prepareQuery<PreparedQueryConfig & { execute: any }>(
				query,
				fields ? 'arrays' : 'raw',
				name ?? generateName,
				mapper,
				{ type: 'delete', tables: [...extractUsedTable(this.config.table)] },
				cacheConfig,
			);

			return preparedQuery;
		});
	}

	prepare(name?: string): PgAsyncDeletePrepare<this> {
		return this._prepare(name, true);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}

applyMixins(PgAsyncDeleteBase, [QueryPromise]);
