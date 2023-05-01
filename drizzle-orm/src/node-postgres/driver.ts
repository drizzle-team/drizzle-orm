import pg from 'pg';
import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { PgDatabase } from '~/pg-core/db';
import { PgDialect } from '~/pg-core/dialect';
import { type ExtractTablesWithRelations, type TablesWithRelations } from '~/relations';
import type { NodePgClient, NodePgQueryResultHKT } from './session';
import { NodePgSession } from './session';

const { types } = pg;

export interface PgDriverOptions {
	logger?: Logger;
}

export class NodePgDriver {
	constructor(
		private client: NodePgClient,
		private dialect: PgDialect,
		private options: PgDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(): NodePgSession {
		return new NodePgSession(this.client, this.dialect, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export interface DrizzleConfig<TSchema extends Record<string, unknown> = {}> {
	logger?: boolean | Logger;
	schema?: TSchema;
}

export type NodePgDatabase<TRelations extends TablesWithRelations = {}> = PgDatabase<NodePgQueryResultHKT, TRelations>;

export function drizzle<TSchema extends Record<string, unknown> = {}>(
	client: NodePgClient,
	config: DrizzleConfig<TSchema> = {},
): NodePgDatabase<ExtractTablesWithRelations<TSchema>> {
	const dialect = new PgDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const driver = new NodePgDriver(client, dialect, { logger });
	const session = driver.createSession();
	return new PgDatabase(dialect, session);
}
