import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SQLiteRelationalQuery, type SQLiteRelationalQueryHKTBase } from '~/sqlite-core/query-builders/query.ts';
import { applyMixins } from '~/utils.ts';
import { SQLiteRunnableQuery } from '../query-builders/runnable.ts';
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
{
	/** @internal */
	_prepare(
		prepare?: boolean,
	): SQLiteEffectPreparedQuery<
		PreparedQueryConfig & { type: unknown; all: TResult; get: TResult; execute: TResult },
		TEffectHKT
	>;

	prepare(): SQLiteEffectPreparedQuery<
		PreparedQueryConfig & { type: unknown; all: TResult; get: TResult; execute: TResult },
		TEffectHKT
	>;

	execute(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, TResult>;
}

export class SQLiteEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteRelationalQuery<SQLiteEffectRelationalQueryHKT<TEffectHKT>, TResult>
	implements RunnableQuery<TResult, 'sqlite'>
{
	static override readonly [entityKind]: string = 'SQLiteEffectRelationalQueryV2';

	declare protected session: SQLiteEffectSession<any, TEffectHKT, any>;
}

applyMixins(SQLiteEffectRelationalQuery, [SQLiteRunnableQuery]);
applyEffectWrapper(SQLiteEffectRelationalQuery);
