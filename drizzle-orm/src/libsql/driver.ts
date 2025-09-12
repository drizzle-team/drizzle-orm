import { type Client, type Config, createClient } from '@libsql/client';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import { construct as construct, type LibSQLDatabase } from './driver-core.ts';

export { LibSQLDatabase } from './driver-core.ts';

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Client = Client,
>(
	...params: [
		TClient | string,
	] | [
		TClient | string,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | Config;
			} | {
				client: TClient;
			})
		),
	]
): LibSQLDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createClient({
			url: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& { connection?: Config; client?: TClient }
			& DrizzleConfig<TSchema, TRelations>;

		if (client) return construct(client, drizzleConfig) as any;

		const instance = typeof connection === 'string' ? createClient({ url: connection }) : createClient(connection!);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): LibSQLDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
