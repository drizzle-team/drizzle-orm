import { applyEffectWrapper, type QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { JoinNullability } from '~/query-builders/select.types.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { Assume } from '~/utils.ts';
import { type Join, PgUpdateBase, type PgUpdateHKTBase } from '../query-builders/update.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.ts';

export type PgEffectUpdatePrepare<T extends AnyPgEffectUpdate> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type PgEffectUpdate<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
> = PgEffectUpdateBase<
	TTable,
	TQueryResult,
	TFrom,
	TSelectedFields,
	TReturning,
	TNullabilityMap,
	TJoins,
	true,
	never
>;

export interface PgEffectUpdateHKT extends PgUpdateHKTBase {
	_type: PgEffectUpdateBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		Assume<this['from'], PgTable | Subquery | PgViewBase | SQL | undefined>,
		Assume<this['selectedFields'], ColumnsSelection | undefined>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		Assume<this['joins'], Join[]>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type AnyPgEffectUpdate = PgEffectUpdateBase<any, any, any, any, any, any, any, any, any>;

export interface PgEffectUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TJoins extends Join[] = [],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryEffect<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]> {}

export class PgEffectUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends PgUpdateBase<
	PgEffectUpdateHKT,
	TTable,
	TQueryResult,
	TFrom,
	TSelectedFields,
	TReturning,
	TNullabilityMap,
	TJoins,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'> {
	static override readonly [entityKind]: string = 'PgEffectUpdate';

	declare protected session: PgEffectSession;

	/** @internal */
	_prepare(name?: string): PgEffectUpdatePrepare<this> {
		const query = this.session.prepareQuery<
			PreparedQueryConfig & { execute: TReturning[] }
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
			type: 'insert',
			tables: extractUsedTable(this.config.table),
		}, this.cacheConfig);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query;
	}

	prepare(name: string): PgEffectUpdatePrepare<this> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues: Record<string, unknown> = {}) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(PgEffectUpdateBase);
