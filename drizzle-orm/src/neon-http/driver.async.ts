import type { NeonQueryFunction } from '@neondatabase/serverless';
import type { DrizzleConfig } from '~/utils.ts';
import { drizzleSync, initMappers, type NeonHttpDatabase } from './driver.ts';

/** @internal */
export async function drizzleAsync<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<any, any>,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): Promise<
	NeonHttpDatabase<TSchema> & {
		$client: TClient;
	}
> {
	const db = drizzleSync(client, config);
	const { types } = await import('@neondatabase/serverless').catch(() => undefined as never);
	initMappers(types);
	return db;
}
