import type mssql from 'mssql';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MsSqlDatabase } from '~/mssql-core/db.ts';
import { MsSqlDialect } from '~/mssql-core/dialect.ts';
import type { DrizzleMsSqlConfig } from '~/mssql-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type Equal, jitCompatCheck } from '~/utils.ts';
import { nodeMssqlCodecs } from './codecs.ts';
import { AutoPool } from './pool.ts';
import type { NodeMsSqlClient, NodeMsSqlPreparedQueryHKT, NodeMsSqlQueryResultHKT } from './session.ts';
import { NodeMsSqlSession } from './session.ts';

export interface MsSqlDriverOptions {
	logger?: Logger;
}

export class NodeMsSqlDriver {
	static readonly [entityKind]: string = 'NodeMsSqlDriver';

	constructor(
		private client: NodeMsSqlClient,
		private dialect: MsSqlDialect,
		private options: MsSqlDriverOptions = {},
	) {
	}

	createSession(
		relations: AnyRelations,
	): NodeMsSqlSession<AnyRelations> {
		return new NodeMsSqlSession(this.client, this.dialect, relations, {
			logger: this.options.logger,
		});
	}
}

export { MsSqlDatabase } from '~/mssql-core/db.ts';

export type NodeMsSqlDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> = MsSqlDatabase<NodeMsSqlQueryResultHKT, NodeMsSqlPreparedQueryHKT, TRelations>;

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodeMsSqlClient = NodeMsSqlClient,
>(
	client: TClient,
	config: DrizzleMsSqlConfig<TRelations> = {},
): NodeMsSqlDatabase<TRelations> & {
	$client: Equal<TClient, NodeMsSqlClient> extends true ? AutoPool : TClient;
} {
	const dialect = new MsSqlDialect({
		useJitMappers: jitCompatCheck(config.jit),
		codecs: config.codecs ?? nodeMssqlCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	if (isCallbackClient(client)) {
		client = client.promise() as any;
	}

	const relations = config.relations ?? {};

	const driver = new NodeMsSqlDriver(client as NodeMsSqlClient, dialect, {
		logger,
	});
	const session = driver.createSession(relations);
	const db = new MsSqlDatabase(dialect, session, relations) as NodeMsSqlDatabase<TRelations>;
	(<any> db).$client = client;

	return db as any;
}

export function getMsSqlConnectionParams(connectionString: string): mssql.config | string {
	try {
		const url = new URL(connectionString);
		return {
			user: url.username,
			password: url.password,
			server: url.hostname,
			port: Number.parseInt(url.port, 10),
			database: url.pathname.replace(/^\//, ''),
			options: {
				encrypt: url.searchParams.get('encrypt') === 'true',
				trustServerCertificate: url.searchParams.get('trustServerCertificate') === 'true',
			},
		};
	} catch {
		return connectionString;
	}
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodeMsSqlClient = AutoPool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			DrizzleMsSqlConfig<TRelations>,
		]
		| [
			(
				& DrizzleMsSqlConfig<TRelations>
				& ({
					connection: string;
				} | {
					client: TClient;
				})
			),
		]
): NodeMsSqlDatabase<TRelations> & {
	$client: Equal<TClient, NodeMsSqlClient> extends true ? AutoPool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new AutoPool(getMsSqlConnectionParams(params[0]));

		return construct(instance, params[1] as DrizzleMsSqlConfig<TRelations> | undefined) as any;
	}

	const { connection, client, ...DrizzleMsSqlConfig } = params[0] as (
		& ({ connection?: mssql.config | string; client?: TClient })
		& DrizzleMsSqlConfig<TRelations>
	);

	if (client) return construct(client, DrizzleMsSqlConfig);

	const instance = typeof connection === 'string'
		? new AutoPool(getMsSqlConnectionParams(connection))
		: new AutoPool(connection!);

	return construct(instance, DrizzleMsSqlConfig) as any;
}

interface CallbackClient {
	promise(): NodeMsSqlClient;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleMsSqlConfig<TRelations>,
	): NodeMsSqlDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
