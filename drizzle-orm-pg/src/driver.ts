import { Logger } from 'drizzle-orm';
import { types } from 'pg';
import { PgDialect } from './dialect';
import { NodePgSession, PgClient, PgSession } from './session';

export interface PgDriverOptions {
	logger?: Logger;
}

export class PgDriver {
	constructor(
		private client: PgClient,
		private dialect: PgDialect,
		private options: PgDriverOptions = {},
	) {
		this.initMappers();
	}

	async connect(): Promise<PgSession> {
		return new NodePgSession(this.client, this.dialect, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}
