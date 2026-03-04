/// <reference types="bun-types" />

import { SQL } from 'bun';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { Mode } from '~/mysql-core/session.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { BunMySqlPreparedQueryHKT, BunMySqlQueryResultHKT } from './session.ts';
import { BunMySqlSession } from './session.ts';

export type BunMySqlDrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> =
	& Omit<DrizzleConfig<TSchema, TRelations>, 'schema'>
	& ({ schema: TSchema; mode: Mode } | { schema?: undefined; mode?: Mode });

export class BunMySqlDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<BunMySqlQueryResultHKT, BunMySqlPreparedQueryHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'BunMySqlDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: SQL,
	config: BunMySqlDrizzleConfig<TSchema, TRelations> = {},
): BunMySqlDatabase<TSchema, TRelations> & {
	$client: SQL;
} {
	const dialect = new MySqlDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

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
	const session = new BunMySqlSession(client, dialect, relations, schema, { logger, mode, cache: config.cache });
	const db = new BunMySqlDatabase(dialect, session, relations, schema as any, mode) as BunMySqlDatabase<
		TSchema,
		TRelations
	>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends SQL = SQL,
>(
	...params: [
		string,
	] | [
		string,
		BunMySqlDrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& BunMySqlDrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | ({ url?: string } & SQL.Options);
			} | {
				client: TClient;
			})
		),
	]
): BunMySqlDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new SQL(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as {
		connection?: { url?: string } & SQL.Options;
		client?: TClient;
	} & BunMySqlDrizzleConfig<TSchema, TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = new SQL({ url, ...config });
		return construct(instance, drizzleConfig) as any;
	}

	const instance = new SQL(connection);
	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: BunMySqlDrizzleConfig<TSchema, TRelations>,
	): BunMySqlDatabase<TSchema, TRelations> & {
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
