import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations, ExtractTablesWithRelations, TablesRelationalConfig } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { XataHttpClient, XataHttpQueryResultHKT } from './session.ts';
import { XataHttpSession } from './session.ts';

export interface XataDriverOptions {
	logger?: Logger;
}

export class XataHttpDriver {
	static readonly [entityKind]: string = 'XataDriver';

	constructor(
		private client: XataHttpClient,
		private dialect: PgDialect,
		private options: XataDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		relations: AnyRelations | undefined,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): XataHttpSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig, V1.TablesRelationalConfig> {
		return new XataHttpSession(this.client, this.dialect, relations, schema, {
			logger: this.options.logger,
		});
	}

	initMappers() {
		// TODO: Add custom type parsers
	}
}

export class XataHttpDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgDatabase<XataHttpQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'XataHttpDatabase';

	/** @internal */
	declare readonly session: XataHttpSession<
		TSchema,
		TRelations,
		ExtractTablesWithRelations<TRelations>,
		V1.ExtractTablesWithRelations<TSchema>
	>;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: XataHttpClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): XataHttpDatabase<TSchema, TRelations> & {
	$client: XataHttpClient;
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
		const tablesConfig = V1.extractTablesRelationalConfig(config.schema, V1.createTableRelationsHelpers);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = config.relations;
	const driver = new XataHttpDriver(client, dialect, { logger });
	const session = driver.createSession(relations, schema);

	const db = new XataHttpDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<V1.ExtractTablesWithRelations<TSchema>> | undefined,
	);
	(<any> db).$client = client;

	return db as any;
}
