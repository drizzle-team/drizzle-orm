import pg from 'pg';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { NodePgClient, NodePgQueryResultHKT } from './session.ts';
import { NodePgSession } from './session.ts';

const { types } = pg;

export interface PgDriverOptions {
	logger?: Logger;
}

export class NodePgDriver {
	static readonly [entityKind]: string = 'NodePgDriver';

	constructor(
		private client: NodePgClient,
		private dialect: PgDialect,
		private options: PgDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NodePgSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NodePgSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
		types.setTypeParser(types.builtins.INTERVAL, (val) => val);
	}
}

export class NodePgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<NodePgQueryResultHKT, TSchema> {
	static readonly [entityKind]: string = 'NodePgDatabase';
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodePgClient = NodePgClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NodePgDatabase<TSchema> & {
	$client: TClient;
} {
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

	const driver = new NodePgDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new NodePgDatabase(dialect, session, schema as any) as NodePgDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}
