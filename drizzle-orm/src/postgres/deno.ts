import { parseConnectionString } from '@drizzle-team/minipg';
import { createPool, type Pool, type PoolConfig } from '@drizzle-team/minipg/deno';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { construct, type PostgresDatabase } from './driver-core.ts';
import type { PostgresClient } from './session.ts';

function resolveUrl(config: PoolConfig): PoolConfig {
	if (!config.url) return config;

	const out = { ...parseConnectionString(config.url) } as Record<string, unknown>;
	for (const key of Object.keys(config)) {
		if (key === 'url') continue;
		const value = (config as Record<string, unknown>)[key];
		if (value !== undefined) out[key] = value;
	}

	return out as PoolConfig;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresClient = Pool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			DrizzlePgConfig<TRelations>,
		]
		| [
			& DrizzlePgConfig<TRelations>
			& ({
				client: TClient;
			} | {
				connection: string | PoolConfig;
			}),
		]
): PostgresDatabase<TRelations> & {
	$client: PostgresClient extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createPool(resolveUrl({
			url: params[0],
			temporal: 'string',
		}));

		return construct(
			instance,
			params[1] as DrizzlePgConfig<TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...config } = params[0] as (
		& ({ connection?: PoolConfig | string; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, config);

	const instance = typeof connection === 'string'
		? createPool(resolveUrl({ url: connection }))
		: createPool(resolveUrl({ ...connection! }));

	return construct(instance, config) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PostgresDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
