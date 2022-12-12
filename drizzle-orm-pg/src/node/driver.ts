import { Logger } from 'drizzle-orm';
import { types } from 'pg';
import { PgDialect } from '~/dialect';
import { NodePgClient, NodePgSession } from './session';

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

	async connect(): Promise<NodePgSession> {
		return new NodePgSession(this.client, this.dialect, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export function pg(client: NodePgClient, options: PgDriverOptions = {}) {
	return new NodePgDriver(client, new PgDialect(), options);
}
