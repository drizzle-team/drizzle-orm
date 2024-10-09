import type { DrizzleConfig } from '~/utils.ts';
import { drizzleSync, initMappers, type NodePgDatabase } from './driver.ts';
import type { NodePgClient } from './session.ts';

/** @internal */
export async function drizzleAsync<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodePgClient = NodePgClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): Promise<
	NodePgDatabase<TSchema> & {
		$client: TClient;
	}
> {
	const db = drizzleSync(client, config);
	const pg = await import('pg').catch(() => undefined as never);
	initMappers(pg.pgTypes);
	return db;
}
