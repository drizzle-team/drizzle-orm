import { types } from '@neondatabase/serverless';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import type { DrizzleConfig } from '~/utils.ts';
import { drizzleSync, initMappers, type NeonHttpDatabase } from './driver.ts';

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<any, any>,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NeonHttpDatabase<TSchema> & {
	$client: TClient;
} {
	const db = drizzleSync(client, config);
	initMappers(types);
	return db;
}
