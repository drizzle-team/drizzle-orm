import { types } from '@neondatabase/serverless';
import type { DrizzleConfig } from '~/utils.ts';
import { drizzleSync, initMappers, type NeonDatabase } from './driver.ts';
import type { NeonClient } from './session.ts';

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonClient = NeonClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NeonDatabase<TSchema> & {
	$client: TClient;
} {
	const db = drizzleSync(client, config);
	initMappers(types);
	return db;
}
