import pg, { type Pool, type PoolConfig } from 'pg';
import { CockroachDatabase } from '~/cockroach-core/db.ts';
import { CockroachDialect } from '~/cockroach-core/dialect.ts';
import type { DrizzleCockroachConfig } from '~/cockroach-core/utils.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { nodeCockroachCodecs } from './codecs.ts';
import type { NodeCockroachClient, NodeCockroachQueryResultHKT } from './session.ts';
import { NodeCockroachSession } from './session.ts';

export interface CockroachDriverOptions {
	logger?: Logger;
}

export class NodeCockroachDriver {
	static readonly [entityKind]: string = 'NodeCockroachDriver';

	constructor(
		private client: NodeCockroachClient,
		private dialect: CockroachDialect,
		private options: CockroachDriverOptions = {},
	) {
	}

	createSession(
		relations: AnyRelations,
	): NodeCockroachSession<AnyRelations> {
		return new NodeCockroachSession(this.client, this.dialect, relations, {
			logger: this.options.logger,
		});
	}
}

export class NodeCockroachDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends CockroachDatabase<NodeCockroachQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NodeCockroachDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodeCockroachClient = NodeCockroachClient,
>(
	client: TClient,
	config: DrizzleCockroachConfig<TRelations> = {},
): NodeCockroachDatabase<TRelations> & {
	$client: TClient;
} {
	const dialect = new CockroachDialect({
		useJitMappers: jitCompatCheck(config.jit),
		codecs: config.codecs ?? nodeCockroachCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {};

	const driver = new NodeCockroachDriver(client, dialect, {
		logger,
	});
	const session = driver.createSession(relations);
	const db = new NodeCockroachDatabase(dialect, session, relations) as NodeCockroachDatabase<TRelations>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodeCockroachClient = Pool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			DrizzleCockroachConfig<TRelations>,
		]
		| [
			(
				& DrizzleCockroachConfig<TRelations>
				& ({
					connection: string | PoolConfig;
				} | {
					client: TClient;
				})
			),
		]
): NodeCockroachDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new pg.Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1] as DrizzleCockroachConfig<TRelations> | undefined) as any;
	}

	const { connection, client, ...drizzleCockroaDrizzleCockroachConfig } = params[0] as (
		& ({ connection?: PoolConfig | string; client?: TClient })
		& DrizzleCockroachConfig<TRelations>
	);

	if (client) return construct(client, drizzleCockroaDrizzleCockroachConfig);

	const instance = typeof connection === 'string'
		? new pg.Pool({
			connectionString: connection,
		})
		: new pg.Pool(connection!);

	return construct(instance, drizzleCockroaDrizzleCockroachConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleCockroachConfig<TRelations>,
	): NodeCockroachDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
