import { Logger } from 'drizzle-orm';
import { PgDatabase } from '~/db';
import { PgDialect } from '~/dialect';
import { NodePgDriver } from './driver';
import { NodePgClient } from './session';

export interface ConnectOptions {
	logger?: Logger;
}

export { PgDatabase } from '~/db';

export async function connect(client: NodePgClient, options: ConnectOptions = {}): Promise<PgDatabase> {
	const dialect = new PgDialect();
	const driver = new NodePgDriver(client, dialect, { logger: options.logger });
	const session = await driver.connect();
	return dialect.createDB(session);
}
