import type { Effect } from 'effect/Effect';
import type { TaggedDrizzleQueryError } from '~/effect-core/errors.ts';
import { applyEffectWrapper, type QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { PgRaw } from '../query-builders/raw.ts';

export interface PgEffectRaw<TResult> extends QueryEffect<TResult>, RunnableQuery<TResult, 'pg'>, SQLWrapper {}
export class PgEffectRaw<TResult> extends PgRaw<TResult> implements RunnableQuery<TResult, 'pg'> {
	static override readonly [entityKind]: string = 'PgEffectRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	constructor(
		public execute: () => Effect<TResult, TaggedDrizzleQueryError>,
		sql: SQL,
		query: Query,
		mapBatchResult: (result: unknown) => unknown,
	) {
		super(sql, query, mapBatchResult);
	}

	_prepare(): PreparedQuery {
		return this;
	}
}

applyEffectWrapper(PgEffectRaw);
