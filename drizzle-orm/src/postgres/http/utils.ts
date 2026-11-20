import type { HttpBatchQuery } from '#postgres/http';
import type { BatchItem } from '~/batch.ts';
import { is } from '~/entity.ts';
import { PgBasePreparedQuery } from '~/pg-core/session.ts';
import type { PostgresHttpMultiPrepared, PostgresHttpPreparedQuery } from './session.ts';

/**
 * The statements of `batch`, `pipeline` or `parallel`, prepared and in the form the HTTP clients send: the async and
 * the Effect drivers build them here, the same way. A prepared query is used as is, a builder is prepared
 *
 * @internal
 */
export function buildHttpMulti<TPrepared extends PostgresHttpMultiPrepared = PostgresHttpPreparedQuery<any>>(
	queries: Readonly<(BatchItem<'pg'> | NoInfer<TPrepared>)[]>,
): { prepared: TPrepared[]; built: HttpBatchQuery[] } {
	const prepared: TPrepared[] = new Array(queries.length);
	const built: HttpBatchQuery[] = new Array(queries.length);
	for (let i = 0; i < queries.length; ++i) {
		const item = queries[i]!;
		const preparedQuery = (is(item, PgBasePreparedQuery) ? item : (item as BatchItem<'pg'>)._prepare()) as TPrepared;
		const builtQuery = preparedQuery.getQuery();
		prepared[i] = preparedQuery;
		built[i] = {
			sql: builtQuery.sql,
			params: builtQuery.params,
			mode: preparedQuery.mode === 'arrays' ? 'array' : 'object',
			shape: preparedQuery.shape,
		};
	}

	return { prepared, built };
}
