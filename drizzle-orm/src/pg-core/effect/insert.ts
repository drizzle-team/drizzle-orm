import * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { Assume } from '~/utils.ts';
import type { PgInsertHKTBase } from '../query-builders/insert.ts';
import { PgInsertBase } from '../query-builders/insert.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

export interface PgEffectInsertHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgInsertHKTBase {
	_type: PgEffectInsertBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		this['selectedFields'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnyPgEffectInsert = PgEffectInsertBase<any, any, any, any, any, any>;

export type PgInsertPrepare<
	T extends AnyPgEffectInsert,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	},
	TEffectHKT
>;

export type PgInsert<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgInsertBase<PgEffectInsertHKT<TEffectHKT>, TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export interface PgEffectInsertBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields = undefined,
	TReturning = undefined,
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
{
}

export class PgEffectInsertBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgInsertBase<
	PgEffectInsertHKT<TEffectHKT>,
	TTable,
	TQueryResult,
	TSelectedFields,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'> {
	static override readonly [entityKind]: string = 'PgEffectInsert';

	declare protected session: PgEffectSession<TEffectHKT, any, any, any, any>;

	/** @internal */
	_prepare(name?: string): PgInsertPrepare<this, TEffectHKT> {
		return this.session.prepareQuery<
			PreparedQueryConfig & {
				execute: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
			}
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
			type: 'insert',
			tables: extractUsedTable(this.config.table),
		}, this.cacheConfig);
	}

	prepare(name: string): PgInsertPrepare<this, TEffectHKT> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues).pipe(
				Effect.withSpan('drizzle.operation'),
			);
		});
	};
}

applyEffectWrapper(PgEffectInsertBase);
