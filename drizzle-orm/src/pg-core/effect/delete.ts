import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';
import { PgDeleteBase, type PgDeleteHKTBase } from '../query-builders/delete.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

export type PgEffectDelete<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectDeleteBase<TTable, TQueryResult, TSelectedFields, TReturning, true, never, TEffectHKT>;

export type PgEffectDeletePrepare<
	T extends AnyEffectPgDelete,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	},
	TEffectHKT
>;

export type AnyEffectPgDelete = PgEffectDeleteBase<any, any, any, any, any, any, any>;

export interface PgEffectDeleteHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgDeleteHKTBase {
	_type: PgEffectDeleteBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		Assume<this['selectedFields'], ColumnsSelection | undefined>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
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
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends
	Effect.Effect<
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
		TEffectHKT['error'],
		TEffectHKT['context']
	>
{}

export class PgEffectDeleteBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgDeleteBase<
	PgEffectDeleteHKT<TEffectHKT>,
	TTable,
	TQueryResult,
	TSelectedFields,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
	SQLWrapper
{
	static override readonly [entityKind]: string = 'PgEffectDelete';

	declare protected session: PgEffectSession<TEffectHKT, any, any, any, any>;

	/** @internal */
	_prepare(name?: string, generateName = false): PgEffectDeletePrepare<this, TEffectHKT> {
		const { session, config, dialect, cacheConfig } = this;
		const { returning: fields } = config;

		const query = dialect.sqlToQuery(this.getSQL());
		const mapper = fields
			? this.dialect.mapperGenerators.rows(fields, undefined)
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
	}

	prepare(name?: string): PgEffectDeletePrepare<this, TEffectHKT> {
		return this._prepare(name, true);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(PgEffectDeleteBase);
