import { createPool, type NeonHttpClient, type NeonHttpConfig } from '@drizzle-team/minipg/neon-http';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { construct, type PostgresHttpDatabase } from './driver-core.ts';
import type { PostgresHttpBatchRunner } from './session.ts';

const runBatch = (client: NeonHttpClient): PostgresHttpBatchRunner => (queries, options) =>
	client.transaction(queries, options);

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonHttpClient = NeonHttpClient,
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
				connection: string | NeonHttpConfig;
			}),
		]
): PostgresHttpDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createPool({
			url: params[0],
			temporal: 'string',
		});

		return construct(
			instance,
			runBatch(instance),
			params[1] as DrizzlePgConfig<TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...config } = params[0] as (
		& ({ connection?: NeonHttpConfig | string; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, runBatch(client), config) as any;

	const instance = typeof connection === 'string'
		? createPool({ url: connection })
		: createPool({ ...connection! });

	return construct(instance, runBatch(instance), config) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PostgresHttpDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, async () => [], config) as any;
	}
}
