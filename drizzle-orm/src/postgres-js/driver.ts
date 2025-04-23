import pgClient, { type Options, type PostgresType, type Sql } from 'postgres';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { PostgresJsQueryResultHKT } from './session.ts';
import { PostgresJsSession } from './session.ts';

export class PostgresJsDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<PostgresJsQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsDatabase';
}

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Sql,
	config: DrizzleConfig<TSchema> = {},
): PostgresJsDatabase<TSchema> & {
	$client: Sql;
} {
	const transparentParser = (val: any) => val;

	// Override postgres.js default date parsers: https://github.com/porsager/postgres/discussions/761
	for (const type of ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231']) {
		client.options.parsers[type as any] = transparentParser;
		client.options.serializers[type as any] = transparentParser;
	}
	client.options.serializers['114'] = transparentParser;
	client.options.serializers['3802'] = transparentParser;

	const dialect = new PgDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
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

	const session = new PostgresJsSession(client, dialect, schema, { logger, cache: config.cache });
	const db = new PostgresJsDatabase(dialect, session, schema as any) as PostgresJsDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends Sql = Sql,
>(
	...params: [
		TClient | string,
	] | [
		TClient | string,
		DrizzleConfig<TSchema>,
	] | [
		(
			& DrizzleConfig<TSchema>
			& ({
				connection: string | ({ url?: string } & Options<Record<string, PostgresType>>);
			} | {
				client: TClient;
			})
		),
	]
): PostgresJsDatabase<TSchema> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = pgClient(params[0] as string);

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as {
			connection?: { url?: string } & Options<Record<string, PostgresType>>;
			client?: TClient;
		} & DrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig) as any;

		if (typeof connection === 'object' && connection.url !== undefined) {
			const { url, ...config } = connection;

			const instance = pgClient(url, config);
			return construct(instance, drizzleConfig) as any;
		}

		const instance = pgClient(connection);
		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): PostgresJsDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({
			options: {
				parsers: {},
				serializers: {},
			},
		} as any, config) as any;
	}
}
