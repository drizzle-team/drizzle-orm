import { types } from '@neondatabase/serverless';
import { Logger } from 'drizzle-orm';
import { PgDialect } from '~/dialect';
import { NeonClient, NeonSession } from './session';

export interface NeonDriverOptions {
	logger?: Logger;
}

export class NeonDriver {
	constructor(
		private client: NeonClient,
		private dialect: PgDialect,
		private options: NeonDriverOptions = {},
	) {
		this.initMappers();
	}

	async connect(): Promise<NeonSession> {
		return new NeonSession(this.client, this.dialect, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export function pg(client: NeonClient, options: NeonDriverOptions = {}) {
	return new NeonDriver(client, new PgDialect(), options);
}
