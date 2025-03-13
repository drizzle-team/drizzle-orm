import { type Connection as CallbackConnection, createPool, type Pool as CallbackPool, type PoolOptions } from 'mysql2';
import type { Connection, Pool } from 'mysql2/promise';
import { entityKind } from '~/entity.ts';
import { GoogleSqlDatabase } from '~/googlesql/db.ts';
import { GoogleSqlDialect } from '~/googlesql/dialect.ts';
import type { Mode } from '~/googlesql/session.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import { DrizzleError } from '../errors.ts';
import type { SpannerClient, SpannerPreparedQueryHKT, SpannerQueryResultHKT } from './session.ts';
import { SpannerSession } from './session.ts';

export interface GoogleSqlDriverOptions {
	logger?: Logger;
}

export class SpannerDriver {
	static readonly [entityKind]: string = 'SpannerDriver';

	constructor(
		private client: SpannerClient,
		private dialect: GoogleSqlDialect,
		private options: GoogleSqlDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
		mode: Mode,
	): SpannerSession<Record<string, unknown>, TablesRelationalConfig> {
		return new SpannerSession(this.client, this.dialect, schema, { logger: this.options.logger, mode });
	}
}

export { GoogleSqlDatabase } from '~/googlesql/db.ts';

export class SpannerDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends GoogleSqlDatabase<SpannerQueryResultHKT, SpannerPreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'SpannerDatabase';
}

export type SpannerDrizzleConfig<TSchema extends Record<string, unknown> = Record<string, never>> =
	& Omit<DrizzleConfig<TSchema>, 'schema'>
	& ({ schema: TSchema; mode: Mode } | { schema?: undefined; mode?: Mode });

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends Pool | Connection | CallbackPool | CallbackConnection = CallbackPool,
>(
	client: TClient,
	config: SpannerDrizzleConfig<TSchema> = {},
): SpannerDatabase<TSchema> & {
	$client: TClient;
} {
	const dialect = new GoogleSqlDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const clientForInstance = isCallbackClient(client) ? client.promise() : client;

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		if (config.mode === undefined) {
			throw new DrizzleError({
				message:
					'You need to specify "mode": "planetscale" or "default" when providing a schema. Read more: https://orm.drizzle.team/docs/rqb#modes',
			});
		}

		const tablesConfig = extractTablesRelationalConfig(
			config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const mode = config.mode ?? 'default';

	const driver = new SpannerDriver(clientForInstance as SpannerClient, dialect, { logger });
	const session = driver.createSession(schema, mode);
	const db = new SpannerDatabase(dialect, session, schema as any, mode) as SpannerDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

interface CallbackClient {
	promise(): SpannerClient;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}

export type AnySpannerConnection = Pool | Connection | CallbackPool | CallbackConnection;

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends AnySpannerConnection = CallbackPool,
>(
	...params: [
		TClient | string,
	] | [
		TClient | string,
		SpannerDrizzleConfig<TSchema>,
	] | [
		(
			& SpannerDrizzleConfig<TSchema>
			& ({
				connection: string | PoolOptions;
			} | {
				client: TClient;
			})
		),
	]
): SpannerDatabase<TSchema> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const connectionString = params[0]!;
		const instance = createPool({
			uri: connectionString,
		});

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& { connection?: PoolOptions | string; client?: TClient }
			& SpannerDrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig) as any;

		const instance = typeof connection === 'string'
			? createPool({
				uri: connection,
			})
			: createPool(connection!);
		const db = construct(instance, drizzleConfig);

		return db as any;
	}

	return construct(params[0] as TClient, params[1] as SpannerDrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: SpannerDrizzleConfig<TSchema>,
	): SpannerDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
