import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { construct, type PostgresDatabase } from './driver-core.ts';
import type { PostgresClient } from './session.ts';

// Takes only a client and loads no pool or connection of the bundled client, so a pool or connection from the
// standalone `@drizzle-team/postgres` package is the only copy of the client in the bundle and at runtime.
export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresClient = PostgresClient,
>(
	config: DrizzlePgConfig<TRelations> & { client: TClient },
): PostgresDatabase<TRelations> & { $client: TClient } {
	const { client, ...rest } = config;
	return construct(client, rest) as any;
}

export { PostgresDatabase } from './driver-core.ts';
export type { PostgresClient } from './session.ts';
