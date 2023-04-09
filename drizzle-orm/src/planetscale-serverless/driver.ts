import type { Connection } from '@planetscale/database';
import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { MySqlDatabase } from '~/mysql-core/db';
import { MySqlDialect } from '~/mysql-core/dialect';
import type { PlanetscaleQueryResultHKT } from './session';
import { PlanetscaleSession } from './session';

export interface PlanetscaleSDriverOptions {
	logger?: Logger;
}

export class PlanetscaleDriver {
	constructor(
		private client: Connection,
		private dialect: MySqlDialect,
		private options: PlanetscaleSDriverOptions = {},
	) {
	}

	createSession(): PlanetscaleSession {
		return new PlanetscaleSession(this.client, this.dialect, undefined, { logger: this.options.logger });
	}
}

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export type PlanetScaleDatabase = MySqlDatabase<PlanetscaleQueryResultHKT>;

export function drizzle(
	client: Connection,
	config: DrizzleConfig = {},
): PlanetScaleDatabase {
	const dialect = new MySqlDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const driver = new PlanetscaleDriver(client, dialect, { logger });
	const session = driver.createSession();
	return new MySqlDatabase(dialect, session);
}
