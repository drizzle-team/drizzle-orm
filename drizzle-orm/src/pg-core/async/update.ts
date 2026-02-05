import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { JoinNullability } from '~/query-builders/select.types.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { applyMixins, type Assume, type NeonAuthToken } from '~/utils.ts';
import { type Join, PgUpdateBase, type PgUpdateHKTBase } from '../query-builders/update.ts';
import { extractUsedTable } from '../utils.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgAsyncPreparedQuery, PgAsyncSession } from './session.ts';

export type PgAsyncUpdatePrepare<T extends AnyPgAsyncUpdate> = PgAsyncPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type PgAsyncUpdate<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
> = PgAsyncUpdateBase<
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

export interface PgAsyncUpdateHKT extends PgUpdateHKTBase {
	_type: PgAsyncUpdateBase<
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

export type AnyPgAsyncUpdate = PgAsyncUpdateBase<any, any, any, any, any, any, any, any, any>;

export interface PgAsyncUpdateBase<
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
> extends QueryPromise<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]> {}

export class PgAsyncUpdateBase<
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
	PgAsyncUpdateHKT,
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
	static override readonly [entityKind]: string = 'PgAsyncUpdate';

	declare protected session: PgAsyncSession;

	/** @internal */
	_prepare(name?: string, generateName = false): PgAsyncUpdatePrepare<this> {
		const query = this.dialect.sqlToQuery(this.getSQL());
		const preparedQuery = this.session.prepareQuery<
			PreparedQueryConfig & { execute: TReturning[] }
		>(
			query,
			this.config.returning,
			name ?? (generateName ? preparedStatementName(query.sql, query.params) : name),
			true,
			undefined,
			{
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			},
			this.cacheConfig,
		);
		preparedQuery.joinsNotNullableMap = this.joinsNotNullableMap;
		return preparedQuery.setToken(this.authToken);
	}

	prepare(name?: string): PgAsyncUpdatePrepare<this> {
		return this._prepare(name, true);
	}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues: Record<string, unknown> = {}) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyMixins(PgAsyncUpdateBase, [QueryPromise]);
