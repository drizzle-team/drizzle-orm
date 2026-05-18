import type { Connection as CallbackConnection, Pool as CallbackPool } from 'mysql2';
import { type Connection, createPool, type Pool, type PoolOptions } from 'mysql2/promise';
import type { Cache } from '~/cache/core/index.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { DrizzleMySqlConfig } from '~/mysql-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import type { MySql2Client, MySql2QueryResultHKT } from './session.ts';
import { MySql2Session } from './session.ts';

export interface MySqlDriverOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMappers?: boolean;
}
export { MySqlDatabase } from '~/mysql-core/db.ts';

export class MySql2Database<
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<MySql2QueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'MySql2Database';
}
function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Pool | Connection | CallbackPool | CallbackConnection = Pool,
>(
	client: TClient,
	config: DrizzleMySqlConfig<TRelations> = {},
): MySql2Database<TRelations> & {
	$client: AnyMySql2Connection extends TClient ? Pool : TClient;
} {
	const dialect = new MySqlDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const clientForInstance = isCallbackClient(client) ? client.promise() : client;

	const relations = config.relations ?? {} as TRelations;
	const session = new MySql2Session(clientForInstance as MySql2Client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new MySql2Database(
		dialect,
		session,
		relations,
	) as MySql2Database<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

interface CallbackClient {
	promise(): MySql2Client;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}

export type AnyMySql2Connection = Pool | Connection | CallbackPool | CallbackConnection;

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AnyMySql2Connection = Pool,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleMySqlConfig<TRelations>,
	] | [
		(
			& DrizzleMySqlConfig<TRelations>
			& ({
				connection: string | PoolOptions;
			} | {
				client: TClient;
			})
		),
	]
): MySql2Database<TRelations> & {
	$client: AnyMySql2Connection extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const connectionString = params[0]!;
		const instance = createPool({
			uri: connectionString,
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleMySqlConfig } = params[0] as
		& { connection?: PoolOptions | string; client?: TClient }
		& DrizzleMySqlConfig<TRelations>;

	if (client) return construct(client, DrizzleMySqlConfig) as any;

	const instance = typeof connection === 'string'
		? createPool({
			uri: connection,
			supportBigNumbers: true,
		})
		: createPool(connection!);
	const db = construct(instance, DrizzleMySqlConfig);

	return db as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleMySqlConfig<TRelations>,
	): MySql2Database<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
