import type { PrismaClient } from '@prisma/client/extension';

import { Prisma } from '@prisma/client';

import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase, PgDialect } from '~/pg-core/index.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { PrismaPgQueryResultHKT } from './session.ts';
import { PrismaPgSession } from './session.ts';

export class PrismaPgDatabase extends PgDatabase<PrismaPgQueryResultHKT, Record<string, never>> {
	static override readonly [entityKind]: string = 'PrismaPgDatabase';

	constructor(client: PrismaClient, logger: Logger | undefined) {
		const dialect = new PgDialect();
		super(dialect, new PrismaPgSession(dialect, client, { logger }), undefined);
	}
}

export type PrismaPgConfig = Omit<DrizzleConfig, 'schema'>;

export function drizzle(config: PrismaPgConfig = {}) {
	let logger: Logger | undefined;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	return Prisma.defineExtension((client) => {
		return client.$extends({
			name: 'drizzle',
			client: {
				$drizzle: new PrismaPgDatabase(client, logger),
			},
		});
	});
}
