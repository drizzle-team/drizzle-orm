import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { minipgShapeCodecs } from '../codecs.ts';
import { buildShape } from '../shape.ts';
import type {
	PostgresHttpBatchOptions,
	PostgresHttpBatchRunner,
	PostgresHttpClient,
	PostgresHttpQueryResultHKT,
} from './session.ts';
import { PostgresHttpSession } from './session.ts';

export class PostgresHttpDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PostgresHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresHttpDatabase';

	/** @internal */
	declare session: PostgresHttpSession<TRelations>;

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresHttpBatchOptions,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch, options) as Promise<BatchResponse<T>>;
	}
}

/** @internal */
export function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresHttpClient = PostgresHttpClient,
>(
	client: TClient,
	runBatch: PostgresHttpBatchRunner,
	config: DrizzlePgConfig<TRelations> = {},
): PostgresHttpDatabase<TRelations> & {
	$client: TClient;
} {
	const clientConfig = (<any> client).cfg ?? client;
	if (config.codecs && clientConfig?.temporal) clientConfig.temporal = 'string';

	const dialect = new PgDialect({
		codecs: config.codecs ?? minipgShapeCodecs,
		useJitMappers: jitCompatCheck(config.jit),
		// Shape generator is statically linked to own set of codecs
		// Overriden codecs are impossible to determine shape for
		shapeGenerator: config.codecs ? undefined : buildShape,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {};
	const session = new PostgresHttpSession(client, runBatch, dialect, relations, {
		logger,
		cache: config.cache,
	});

	const db = new PostgresHttpDatabase(
		dialect,
		session,
		relations,
	) as PostgresHttpDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
