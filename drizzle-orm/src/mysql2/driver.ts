import type { Connection as CallbackConnection, Pool as CallbackPool } from 'mysql2';
import { type Connection, createPool, type Pool, type PoolOptions } from 'mysql2/promise';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/index.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { Mode } from '~/mysql-core/session.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { DrizzleError } from '../errors.ts';
import type { MySql2Client, MySql2PreparedQueryHKT, MySql2QueryResultHKT } from './session.ts';
import { MySql2Session } from './session.ts';

export interface MySqlDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class MySql2Driver {
	static readonly [entityKind]: string = 'MySql2Driver';

	constructor(
		private client: MySql2Client,
		private dialect: MySqlDialect,
		private options: MySqlDriverOptions = {},
	) {
	}

	createSession(
		relations: AnyRelations,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
		mode: Mode,
	): MySql2Session<Record<string, unknown>, AnyRelations, V1.TablesRelationalConfig> {
		return new MySql2Session(this.client, this.dialect, relations, schema, {
			logger: this.options.logger,
			mode,
			cache: this.options.cache,
		});
	}
}

export { MySqlDatabase } from '~/mysql-core/db.ts';

export class MySql2Database<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<MySql2QueryResultHKT, MySql2PreparedQueryHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'MySql2Database';
}

export type MySql2DrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> =
	& Omit<DrizzleConfig<TSchema, TRelations>, 'schema'>
	& ({ schema: TSchema; mode: Mode } | { schema?: undefined; mode?: Mode });

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Pool | Connection | CallbackPool | CallbackConnection = Pool,
>(
	client: TClient,
	config: MySql2DrizzleConfig<TSchema, TRelations> = {},
): MySql2Database<TSchema, TRelations> & {
	$client: AnyMySql2Connection extends TClient ? Pool : TClient;
} {
	const dialect = new MySqlDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const clientForInstance = isCallbackClient(client) ? client.promise() : client;

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		if (config.mode === undefined) {
			throw new DrizzleError({
				message:
					'You need to specify "mode": "planetscale" or "default" when providing a schema. Read more: https://orm.drizzle.team/docs/rqb#modes',
			});
		}

		const tablesConfig = V1.extractTablesRelationalConfig(
			config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const mode = config.mode ?? 'default';

	const relations = config.relations ?? {} as TRelations;
	const driver = new MySql2Driver(clientForInstance as MySql2Client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(relations, schema, mode);
	const db = new MySql2Database(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
		mode,
	) as MySql2Database<TSchema, TRelations>;
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
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AnyMySql2Connection = Pool,
>(
	...params: [
		string,
	] | [
		string,
		MySql2DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& MySql2DrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | PoolOptions;
			} | {
				client: TClient;
			})
		),
	]
): MySql2Database<TSchema, TRelations> & {
	$client: AnyMySql2Connection extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const connectionString = params[0]!;
		const instance = createPool({
			uri: connectionString,
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& { connection?: PoolOptions | string; client?: TClient }
		& MySql2DrizzleConfig<TSchema, TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	const instance = typeof connection === 'string'
		? createPool({
			uri: connection,
			supportBigNumbers: true,
		})
		: createPool(connection!);
	const db = construct(instance, drizzleConfig);

	return db as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: MySql2DrizzleConfig<TSchema, TRelations>,
	): MySql2Database<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
