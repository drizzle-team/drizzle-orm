import { client as createClient, type HttpClient, type HttpConfig } from 'minipg/http';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { construct, type PostgresHttpDatabase } from './driver-core.ts';
import type { PostgresHttpBatchRunner } from './session.ts';

const runBatch = (client: HttpClient): PostgresHttpBatchRunner => (queries, options) => client.batch(queries, options);

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends HttpClient = HttpClient,
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
				connection: string | HttpConfig;
			}),
		]
): PostgresHttpDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createClient({
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
		& ({ connection?: HttpConfig | string; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, runBatch(client), config) as any;

	const instance = typeof connection === 'string'
		? createClient({ url: connection })
		: createClient({ ...connection! });

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
