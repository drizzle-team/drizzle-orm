import type { BatchItem } from '~/batch.ts';
import { is } from '~/entity.ts';
import type { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { type QueryGenerator, YieldableQuery, YieldableQueryBatch } from './generator.ts';

export function runSync<TRes>(
	db: SQLiteAsyncDatabase<'sync', any, any>,
	generator: QueryGenerator<TRes>,
) {
	const { session } = db;
	const iter = generator;

	let step = iter.next();
	while (!step.done) {
		const query = step.value;
		if (is(query, YieldableQueryBatch)) {
			session.transaction((tx) => {
				for (const sql of query.queries) {
					tx.run(sql);
				}
			});

			step = iter.next();
		} else if (is(query, YieldableQuery)) {
			const { noResponse, sql } = query;

			if (noResponse) {
				session.run(sql);
				step = iter.next();
			} else {
				const result = session.objects(sql);
				step = iter.next(result);
			}
		} else {
			runSync(db, query);
		}
	}

	return step.value;
}

export async function runAsync<TRes>(
	db: SQLiteAsyncDatabase<'async', any, any>,
	generator: QueryGenerator<TRes>,
	/** `sqlite-proxy` doesn't support object mode querying  */
	noObjectMode?: boolean,
) {
	const session = db.session as typeof db.session & {
		batch?: (items: BatchItem<'sqlite'>[]) => Promise<any>;
	};
	const batchTx = 'batch' in session;

	const iter = generator;

	let step = iter.next();
	while (!step.done) {
		const query = step.value;
		if (is(query, YieldableQueryBatch)) {
			if (batchTx) {
				await session.batch!(query.queries.map((q) => db.run(q)));
			} else {
				await session.transaction(async (tx) => {
					for (const sql of query.queries) {
						await tx.run(sql);
					}
				});
			}

			step = iter.next();
		} else if (is(query, YieldableQuery)) {
			const { noResponse, sql } = query;

			if (noResponse) {
				await session.run(sql);
				step = iter.next();
			} else {
				if (noObjectMode) {
					const raw = await session.arrays(sql);
					step = iter.next(query.arrayToObjectShape ? raw.map((v) => query.reshape(v)) : raw);
				} else {
					const result = await session.objects(sql);
					step = iter.next(result);
				}
			}
		} else {
			await runAsync(db, query);
		}
	}

	return step.value;
}
