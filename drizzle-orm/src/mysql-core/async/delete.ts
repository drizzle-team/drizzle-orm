import { entityKind } from '~/entity.ts';
import { MySqlDeleteBase, type MySqlDeleteHKTBase } from '~/mysql-core/query-builders/delete.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlQueryResultKind } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { MySqlAsyncPreparedQuery, MySqlAsyncSession } from './session.ts';

export type MySqlAsyncDelete<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
> = MySqlAsyncDeleteBase<TTable, TQueryResult, true, never>;

export type MySqlAsyncDeletePrepare<T extends AnyMySqlAsyncDelete> = MySqlAsyncPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: MySqlQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	}
>;

export type AnyMySqlAsyncDelete = MySqlAsyncDeleteBase<any, any, any, any>;

export interface MySqlAsyncDeleteHKT extends MySqlDeleteHKTBase {
	_type: MySqlAsyncDeleteBase<
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export interface MySqlAsyncDeleteBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<MySqlQueryResultKind<TQueryResult, never>> {}

export class MySqlAsyncDeleteBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends MySqlDeleteBase<MySqlAsyncDeleteHKT, TTable, TQueryResult, TDynamic, TExcludedMethods> {
	static override readonly [entityKind]: string = 'MySqlAsyncDelete';

	declare protected session: MySqlAsyncSession<TQueryResult, any>;

	prepare(): MySqlAsyncDeletePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			'raw',
			undefined,
			{
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			},
		);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();
}

applyMixins(MySqlAsyncDeleteBase, [QueryPromise]);
