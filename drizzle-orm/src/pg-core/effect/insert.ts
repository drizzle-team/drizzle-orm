import { applyEffectWrapper, type QueryEffect } from '~/effect-core/query-effect.ts';
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

export interface PgEffectInsertHKT extends PgInsertHKTBase {
	_type: PgEffectInsertBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		this['selectedFields'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type AnyPgEffectInsert = PgEffectInsertBase<any, any, any, any, any, any>;

export type PgInsertPrepare<T extends AnyPgEffectInsert> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export type PgInsert<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgInsertBase<PgEffectInsertHKT, TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

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
> extends QueryEffect<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]> {
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
> extends PgInsertBase<PgEffectInsertHKT, TTable, TQueryResult, TSelectedFields, TReturning, TDynamic, TExcludedMethods>
	implements RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectInsert';

	declare protected session: PgEffectSession;

	/** @internal */
	_prepare(name?: string): PgInsertPrepare<this> {
		return this.session.prepareQuery<
			PreparedQueryConfig & {
				execute: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
			}
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
			type: 'insert',
			tables: extractUsedTable(this.config.table),
		}, this.cacheConfig);
	}

	prepare(name: string): PgInsertPrepare<this> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}

applyEffectWrapper(PgEffectInsertBase);
