import type { Config } from '@planetscale/database';
import { Client } from '@planetscale/database';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { PlanetScalePreparedQueryHKT, PlanetscaleQueryResultHKT } from './session.ts';
import { PlanetscaleSession } from './session.ts';

export interface PlanetscaleSDriverOptions {
	logger?: Logger;
}

export class PlanetScaleDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<PlanetscaleQueryResultHKT, PlanetScalePreparedQueryHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'PlanetScaleDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Client = Client,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): PlanetScaleDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	// Client is not Drizzle Object, so we can ignore this rule here
	// eslint-disable-next-line no-instanceof/no-instanceof
	if (!(client instanceof Client)) {
		throw new Error(`Warning: You need to pass an instance of Client:

import { Client } from "@planetscale/database";

const client = new Client({
  host: process.env["DATABASE_HOST"],
  username: process.env["DATABASE_USERNAME"],
  password: process.env["DATABASE_PASSWORD"],
});

const db = drizzle(client);
		`);
	}

	const dialect = new MySqlDialect({ casing: config.casing });
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
	const session = new PlanetscaleSession(client, dialect, undefined, relations, schema, { logger });
	const db = new PlanetScaleDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
		'planetscale',
	) as PlanetScaleDatabase<TSchema, TRelations>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Client = Client,
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
				connection: string | Config;
			} | {
				client: TClient;
			})
		),
	]
): PlanetScaleDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Client({
			url: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& { connection?: Config | string; client?: TClient }
			& DrizzleConfig;

		if (client) return construct(client, drizzleConfig) as any;

		const instance = typeof connection === 'string'
			? new Client({
				url: connection,
			})
			: new Client(
				connection!,
			);

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
	): PlanetScaleDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
