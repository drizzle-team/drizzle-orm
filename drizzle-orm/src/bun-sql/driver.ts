/// <reference types="bun-types" />

import type { SQLOptions } from 'bun';
import { SQL } from 'bun';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { BunSQLQueryResultHKT } from './session.ts';
import { BunSQLSession } from './session.ts';

export class BunSQLDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgDatabase<BunSQLQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: SQL,
	config: DrizzleConfig<TSchema, TRelations> = {},
): BunSQLDatabase<TSchema, TRelations> & {
	$client: SQL;
} {
	const dialect = new PgDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
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

	const relations = config.relations;
	const session = new BunSQLSession(client, dialect, relations, schema, { logger });
	const db = new BunSQLDatabase(dialect, session, relations, schema as any) as BunSQLDatabase<TSchema, TRelations>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends SQL = SQL,
>(
	...params: [
		TClient | string,
	] | [
		TClient | string,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | ({ url?: string } & SQLOptions);
			} | {
				client: TClient;
			})
		),
	]
): BunSQLDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new SQL(params[0]);

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as {
			connection?: { url?: string } & SQLOptions;
			client?: TClient;
		} & DrizzleConfig<TSchema, TRelations>;

		if (client) return construct(client, drizzleConfig) as any;

		if (typeof connection === 'object' && connection.url !== undefined) {
			const { url, ...config } = connection;

			const instance = new SQL({ url, ...config });
			return construct(instance, drizzleConfig) as any;
		}

		const instance = new SQL(connection);
		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): BunSQLDatabase<TSchema, TRelations> & {
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
