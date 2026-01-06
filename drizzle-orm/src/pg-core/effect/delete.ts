import { applyEffectWrapper, type QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { Assume } from '~/utils.ts';
import { PgDeleteBase, type PgDeleteHKTBase } from '../query-builders/delete.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

export type PgEffectDelete<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgEffectDeleteBase<TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export type PgEffectDeletePrepare<T extends AnyEffectPgDelete> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type AnyEffectPgDelete = PgEffectDeleteBase<any, any, any, any, any, any>;

export interface PgEffectDeleteHKT extends PgDeleteHKTBase {
	_type: PgEffectDeleteBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		Assume<this['selectedFields'], ColumnsSelection | undefined>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export interface PgEffectDeleteBase<
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
> extends QueryEffect<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]> {}

export class PgEffectDeleteBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends PgDeleteBase<PgEffectDeleteHKT, TTable, TQueryResult, TSelectedFields, TReturning, TDynamic, TExcludedMethods>
	implements
		TypedQueryBuilder<
			TSelectedFields,
			TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]
		>,
		RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'PgEffectDelete';

	declare protected session: PgEffectSession;

	/** @internal */
	_prepare(name?: string): PgEffectDeletePrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			}, this.cacheConfig);
		});
	}

	prepare(name: string): PgEffectDeletePrepare<this> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}

applyEffectWrapper(PgEffectDeleteBase);
