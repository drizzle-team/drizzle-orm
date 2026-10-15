import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import { applyMixins } from '~/utils.ts';
import { MySqlRelationalQuery, type MySqlRelationalQueryHKTBase } from '../query-builders/query.ts';
import type { MySqlPreparedQueryConfig } from '../session.ts';
import type { MySqlAsyncPreparedQuery, MySqlAsyncSession } from './session.ts';

export type AnyMySqlAsyncRelationalQuery = MySqlAsyncRelationalQuery<any>;

export interface MySqlAsyncRelationalQueryHKT extends MySqlRelationalQueryHKTBase {
	_type: MySqlAsyncRelationalQuery<this['result']>;
}

export interface MySqlAsyncRelationalQuery<TResult> extends QueryPromise<TResult> {}
export class MySqlAsyncRelationalQuery<TResult> extends MySqlRelationalQuery<MySqlAsyncRelationalQueryHKT, TResult> {
	static override readonly [entityKind]: string = 'MySqlAsyncRelationalQueryV2';

	declare protected session: MySqlAsyncSession;

	prepare() {
		const { query, builtQuery } = this._toSQL();
		const mapper = this.dialect.mapperGenerators.relationalRows({
			isFirst: this.mode === 'first',
			parseJson: false,
			parseJsonIfString: false,
			rootJsonMappers: false,
			arrayModeRoot: true,
			selection: query.selection,
		});

		return this.session.prepareQuery(
			builtQuery,
			'arrays',
			mapper,
		) as MySqlAsyncPreparedQuery<MySqlPreparedQueryConfig & { execute: TResult }>;
	}

	execute(): Promise<TResult> {
		return this.prepare().execute();
	}
}

applyMixins(MySqlAsyncRelationalQuery, [QueryPromise]);
