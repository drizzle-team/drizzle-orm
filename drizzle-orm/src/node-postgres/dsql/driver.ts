import { AuroraDSQLPool, type AuroraDSQLPoolConfig } from '@aws/aurora-dsql-node-postgres-connector';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { DsqlAsyncDatabase } from '~/pg-core/async/dsql/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { nodePgCodecs } from './codecs.ts';
import type {
	NodePgDsqlClient,
	NodePgDsqlQueryResultHKT,
	NodePgDsqlTransaction,
	NodePgDsqlTransactionConfig,
} from './session.ts';
import { NodePgDsqlSession } from './session.ts';

export class NodePgDsqlDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends DsqlAsyncDatabase<NodePgDsqlQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NodePgDsqlDatabase';

	override transaction<T>(
		transaction: (tx: NodePgDsqlTransaction<TRelations>) => Promise<T>,
		config?: NodePgDsqlTransactionConfig,
	): Promise<T> {
		return super.transaction(transaction, config);
	}
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgDsqlClient = NodePgDsqlClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): NodePgDsqlDatabase<TRelations> & {
	$client: NodePgDsqlClient extends TClient ? AuroraDSQLPool : TClient;
} {
	const dialect = new PgDialect({
		useJitMappers: jitCompatCheck(config.jit),
		codecs: config.codecs ?? nodePgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {};
	const session = new NodePgDsqlSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});

	const db = new NodePgDsqlDatabase(
		dialect,
		session,
		relations,
	) as NodePgDsqlDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgDsqlClient = AuroraDSQLPool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			DrizzlePgConfig<TRelations>,
		]
		| [
			& DrizzlePgConfig<TRelations>
			& ({
				client: TClient;
			} | {
				connection: string | AuroraDSQLPoolConfig;
			}),
		]
): NodePgDsqlDatabase<TRelations> & {
	$client: NodePgDsqlClient extends TClient ? AuroraDSQLPool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new AuroraDSQLPool({
			connectionString: params[0],
		});

		return construct(
			instance,
			params[1] as DrizzlePgConfig<TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...drizzlePgCDrizzlePgConfig } = params[0] as (
		& ({ connection?: AuroraDSQLPoolConfig | string; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, drizzlePgCDrizzlePgConfig);

	const instance = typeof connection === 'string'
		? new AuroraDSQLPool({
			connectionString: connection,
		})
		: new AuroraDSQLPool(connection!);

	return construct(instance, drizzlePgCDrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): NodePgDsqlDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
