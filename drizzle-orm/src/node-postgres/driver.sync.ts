import pg from 'pg';
import type { DrizzleConfig } from '~/utils.ts';
import { drizzleSync, initMappers, type NodePgDatabase } from './driver.ts';
import type { NodePgClient } from './session.ts';

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodePgClient = NodePgClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NodePgDatabase<TSchema> & {
	$client: TClient;
} {
	const db = drizzleSync(client, config);
	initMappers(pg.pgTypes);
	return db;
}
