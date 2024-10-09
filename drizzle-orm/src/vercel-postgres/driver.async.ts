import type { DrizzleConfig } from '~/utils.ts';
import { drizzleSync, initMappers, type VercelPgDatabase } from './driver.ts';
import type { VercelPgClient } from './session.ts';

/** @internal */
export async function drizzleAsync<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: VercelPgClient,
	config: DrizzleConfig<TSchema> = {},
): Promise<
	VercelPgDatabase<TSchema> & {
		$client: VercelPgClient;
	}
> {
	const db = drizzleSync(client, config);
	const { types } = await import('@vercel/postgres');
	initMappers(types);
	return db;
}
