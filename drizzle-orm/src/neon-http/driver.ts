import type { NeonQueryFunction } from '@neondatabase/serverless';
import { types } from '@neondatabase/serverless';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from '~/relations.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type NeonHttpClient, type NeonHttpQueryResultHKT, NeonHttpSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
}

export class NeonHttpDriver {
	static readonly [entityKind]: string = 'NeonDriver';

	constructor(
		private client: NeonHttpClient,
		private dialect: PgDialect,
		private options: NeonDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NeonHttpSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NeonHttpSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export class NeonHttpDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<NeonHttpQueryResultHKT, TSchema> {
	static readonly [entityKind]: string = 'NeonHttpDatabase';

	/** @internal */
	declare readonly session: NeonHttpSession<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: NeonQueryFunction<any, any>,
	config: DrizzleConfig<TSchema> = {},
): NeonHttpDatabase<TSchema> {
	const dialect = new PgDialect();
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

	const driver = new NeonHttpDriver(client, dialect, { logger });
	const session = driver.createSession(schema);

	return new NeonHttpDatabase(
		dialect,
		session,
		schema as RelationalSchemaConfig<ExtractTablesWithRelations<TSchema>> | undefined,
	);
}
