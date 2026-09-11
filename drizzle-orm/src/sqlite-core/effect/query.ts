import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SQLiteRelationalQuery, type SQLiteRelationalQueryHKTBase } from '~/sqlite-core/query-builders/query.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { SQLiteEffectPreparedQuery, SQLiteEffectSession } from './session.ts';

export type AnySQLiteEffectRelationalQuery = SQLiteEffectRelationalQuery<any, any>;

export interface SQLiteEffectRelationalQueryHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteRelationalQueryHKTBase
{
	_type: SQLiteEffectRelationalQuery<this['result'], TEffectHKT>;
}

export interface SQLiteEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends QueryEffectKind<TEffectHKT, TResult>
{}

export class SQLiteEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteRelationalQuery<SQLiteEffectRelationalQueryHKT<TEffectHKT>, TResult>
	implements RunnableQuery<TResult, 'sqlite'>
{
	static override readonly [entityKind]: string = 'SQLiteEffectRelationalQueryV2';

	declare protected session: SQLiteEffectSession<any, TEffectHKT, any>;

	/** @internal */
	_prepare(
		prepare = false,
	): SQLiteEffectPreparedQuery<
		PreparedQueryConfig & { type: unknown; all: TResult; get: TResult; execute: TResult },
		TEffectHKT
	> {
		const { query, builtQuery } = this._toSQL();

		const mapper = this.dialect.mapperGenerators.relationalRows({
			isFirst: this.mode === 'first',
			parseJson: true,
			parseJsonIfString: false,
			rootJsonMappers: false,
			selection: query.selection,
			arrayModeRoot: true,
		});

		return this.session.prepareQuery(
			builtQuery,
			'arrays',
			prepare,
			'all',
			mapper,
		) as SQLiteEffectPreparedQuery<
			PreparedQueryConfig & { type: unknown; all: TResult; get: TResult; execute: TResult },
			TEffectHKT
		>;
	}

	prepare(): SQLiteEffectPreparedQuery<
		PreparedQueryConfig & { type: unknown; all: TResult; get: TResult; execute: TResult },
		TEffectHKT
	> {
		return this._prepare(true);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this._prepare().execute(placeholderValues);
	}
}

applyEffectWrapper(SQLiteEffectRelationalQuery);
