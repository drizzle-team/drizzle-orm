import { entityKind } from '~/entity.ts';
import { MySqlUpdateBase, type MySqlUpdateHKTBase } from '~/mysql-core/query-builders/update.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlQueryResultKind } from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { MySqlAsyncPreparedQuery, MySqlAsyncSession } from './session.ts';

export type MySqlAsyncUpdate<
	TTable extends MySqlTable = MySqlTable,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
> = MySqlAsyncUpdateBase<TTable, TQueryResult, true, never>;

export type MySqlAsyncUpdatePrepare<T extends AnyMySqlAsyncUpdate> = MySqlAsyncPreparedQuery<
	MySqlPreparedQueryConfig & {
		execute: MySqlQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	}
>;

export type AnyMySqlAsyncUpdate = MySqlAsyncUpdateBase<any, any, any, any>;

export interface MySqlAsyncUpdateHKT extends MySqlUpdateHKTBase {
	_type: MySqlAsyncUpdateBase<
		Assume<this['table'], MySqlTable>,
		Assume<this['queryResult'], MySqlQueryResultHKT>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export interface MySqlAsyncUpdateBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<MySqlQueryResultKind<TQueryResult, never>> {}

export class MySqlAsyncUpdateBase<
	TTable extends MySqlTable,
	TQueryResult extends MySqlQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends MySqlUpdateBase<MySqlAsyncUpdateHKT, TTable, TQueryResult, TDynamic, TExcludedMethods> {
	static override readonly [entityKind]: string = 'MySqlAsyncUpdate';

	declare protected session: MySqlAsyncSession<TQueryResult, any>;

	prepare(): MySqlAsyncUpdatePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			'raw',
			undefined,
			{
				type: 'update',
				tables: extractUsedTable(this.config.table),
			},
		) as MySqlAsyncUpdatePrepare<this>;
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

applyMixins(MySqlAsyncUpdateBase, [QueryPromise]);
