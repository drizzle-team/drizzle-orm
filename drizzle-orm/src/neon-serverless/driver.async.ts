import type { DrizzleConfig } from '~/utils.ts';
import { drizzleSync, initMappers, type NeonDatabase } from './driver.ts';
import type { NeonClient } from './session.ts';

/** @internal */
export async function drizzleAsync<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonClient = NeonClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): Promise<
	NeonDatabase<TSchema> & {
		$client: TClient;
	}
> {
	const db = drizzleSync(client, config);
	const { types } = await import('@neondatabase/serverless').catch(() => undefined as never);
	initMappers(types);
	return db;
}
