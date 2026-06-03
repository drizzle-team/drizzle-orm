import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { SQLiteRaw } from '~/sqlite-core/query-builders/raw.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { SQLiteEffectPreparedQuery } from './session.ts';

export interface SQLiteEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteRaw<TResult>, QueryEffectKind<TEffectHKT, TResult>, RunnableQuery<TResult, 'sqlite'>, SQLWrapper
{}

export class SQLiteEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteRaw<TResult>
	implements RunnableQuery<TResult, 'sqlite'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'SQLiteEffectRaw';

	declare protected prepared: SQLiteEffectPreparedQuery<
		PreparedQueryConfig & {
			execute: TResult;
		},
		TEffectHKT
	>;

	constructor(
		prepared: SQLiteEffectPreparedQuery<
			PreparedQueryConfig & {
				execute: TResult;
			},
			TEffectHKT
		>,
		sql: SQL,
		query: Query,
	) {
		super(prepared, sql, query);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.prepared.execute(placeholderValues);
	}
}

applyEffectWrapper(SQLiteEffectRaw);
