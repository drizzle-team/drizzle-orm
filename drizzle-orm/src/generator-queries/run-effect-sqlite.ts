import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { is } from '~/entity.ts';
import type { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import { type QueryGenerator, YieldableQuery, YieldableQueryBatch } from './generator.ts';

export function runEffect<TRes, THKT extends QueryEffectHKTBase>(
	db: SQLiteEffectDatabase<THKT, any, any>,
	generator: QueryGenerator<TRes>,
): Effect.Effect<TRes, SqlError | THKT['error'], THKT['context']> {
	return Effect.gen(function*() {
		const { session } = db;
		const iter = generator;

		let step = iter.next();
		while (!step.done) {
			const query = step.value;
			if (is(query, YieldableQueryBatch)) {
				yield* session.transaction((tx) =>
					Effect.gen(function*() {
						for (const sql of query.queries) {
							yield* tx.run(sql);
						}
					})
				);

				step = iter.next();
			} else if (is(query, YieldableQuery)) {
				const { noResponse, sql } = query;

				if (noResponse) {
					yield* session.run(sql);
					step = iter.next();
				} else {
					const result = yield* session.objects(sql);
					step = iter.next(result);
				}
			} else {
				yield* runEffect(db, query);
			}
		}

		return step.value;
	});
}
