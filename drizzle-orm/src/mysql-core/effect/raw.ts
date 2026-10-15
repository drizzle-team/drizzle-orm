import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { MySqlRaw } from '../query-builders/raw.ts';
import type { MySqlPreparedQueryConfig } from '../session.ts';
import type { MySqlEffectPreparedQuery } from './session.ts';

export interface MySqlEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlRaw<TResult>, QueryEffectKind<TEffectHKT, TResult>, RunnableQuery<TResult, 'mysql'>, SQLWrapper
{}

export class MySqlEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends MySqlRaw<TResult>
	implements RunnableQuery<TResult, 'mysql'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'MySqlEffectRaw';

	declare protected prepared: MySqlEffectPreparedQuery<
		MySqlPreparedQueryConfig & {
			execute: TResult;
		},
		TEffectHKT
	>;

	constructor(
		prepared: MySqlEffectPreparedQuery<
			MySqlPreparedQueryConfig & {
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

	override _prepare() {
		return this.prepared;
	}
}

applyEffectWrapper(MySqlEffectRaw);
