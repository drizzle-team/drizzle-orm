import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { PgDeleteBase, type PgDeleteHKTBase } from '../query-builders/delete.ts';
import { PgRunnableQuery } from '../query-builders/runnable.ts';
import type { PgAsyncPreparedQuery, PgAsyncRuntimeHKT, PgAsyncSession } from './session.ts';

export type PgAsyncDelete<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
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
	runtime: PgAsyncRuntimeHKT;
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
> extends QueryPromise<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]> {
}

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
}

applyMixins(PgAsyncDeleteBase, [QueryPromise, PgRunnableQuery]);
