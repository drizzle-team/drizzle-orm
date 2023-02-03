import { Connection } from '@planetscale/database';
import { Logger } from '~/logger';
import { MySqlDatabase } from '~/mysql-core/db';
import { MySqlDialect } from '~/mysql-core/dialect';
import { PlanetscaleQueryResultHKT, PlanetscaleSession } from './session';

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
		return new PlanetscaleSession(this.client, this.dialect, { logger: this.options.logger });
	}
}

export interface DrizzleConfig {
	logger?: Logger;
}

export type PlanetScaleDatabase = MySqlDatabase<PlanetscaleQueryResultHKT, PlanetscaleSession>;

export function drizzle(
	client: Connection,
	config: DrizzleConfig = {},
): PlanetScaleDatabase {
	const dialect = new MySqlDialect();
	const driver = new PlanetscaleDriver(client, dialect, { logger: config.logger });
	const session = driver.createSession();
	return new MySqlDatabase(dialect, session);
}
