import { types } from '@vercel/postgres';
import type { DrizzleConfig } from '~/utils.ts';
import { drizzleSync, initMappers, type VercelPgDatabase } from './driver.ts';
import type { VercelPgClient } from './session.ts';

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: VercelPgClient,
	config: DrizzleConfig<TSchema> = {},
): VercelPgDatabase<TSchema> & {
	$client: VercelPgClient;
} {
	const db = drizzleSync(client, config);
	initMappers(types);
	return db;
}
