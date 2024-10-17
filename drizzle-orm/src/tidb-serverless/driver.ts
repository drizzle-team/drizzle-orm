import { type Config, connect, Connection } from '@tidbcloud/serverless';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig, IfNotImported, ImportTypeError } from '~/utils.ts';
import type { TiDBServerlessPreparedQueryHKT, TiDBServerlessQueryResultHKT } from './session.ts';
import { TiDBServerlessSession } from './session.ts';

export interface TiDBServerlessSDriverOptions {
	logger?: Logger;
}

export class TiDBServerlessDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends MySqlDatabase<TiDBServerlessQueryResultHKT, TiDBServerlessPreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'TiDBServerlessDatabase';
}

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Connection,
	config: DrizzleConfig<TSchema> = {},
): TiDBServerlessDatabase<TSchema> & {
	$client: Connection;
} {
	const dialect = new MySqlDialect({ casing: config.casing });
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

	const session = new TiDBServerlessSession(client, dialect, undefined, schema, { logger });
	const db = new TiDBServerlessDatabase(dialect, session, schema as any, 'default') as TiDBServerlessDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends Connection = Connection,
>(
	...params: IfNotImported<
		Config,
		[ImportTypeError<'@tidbcloud/serverless'>],
		[
			TClient | string,
		] | [
			TClient | string,
			DrizzleConfig<TSchema>,
		] | [
			& ({
				connection: string | Config;
			} | {
				client: TClient;
			})
			& DrizzleConfig<TSchema>,
		]
	>
): TiDBServerlessDatabase<TSchema> & {
	$client: TClient;
} {
	// eslint-disable-next-line no-instanceof/no-instanceof
	if (params[0] instanceof Connection) {
		return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

	if (typeof params[0] === 'string') {
		const instance = connect({
			url: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& { connection?: Config | string; client?: TClient }
		& DrizzleConfig<TSchema>;

	if (client) return construct(client, drizzleConfig) as any;

	const instance = typeof connection === 'string'
		? connect({
			url: connection,
		})
		: connect(connection!);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): TiDBServerlessDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
