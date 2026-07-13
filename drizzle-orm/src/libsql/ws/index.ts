import { type Client, type Config, createClient } from '@libsql/client/ws';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { construct, type LibSQLDatabase } from '../driver-core.ts';

export function drizzle<TRelations extends AnyRelations = EmptyRelations, TClient extends Client = Client>(
	...params: [
		string,
	] | [
		string,
		DrizzleSQLiteConfig<TRelations>,
	] | [
		(
			& DrizzleSQLiteConfig<TRelations>
			& ({
				connection: string | Config;
			} | {
				client: TClient;
			})
		),
	]
): LibSQLDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createClient({
			url: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleSQLiteConfig } = params[0] as
		& { connection?: Config; client?: TClient }
		& DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, DrizzleSQLiteConfig) as any;

	const instance = typeof connection === 'string' ? createClient({ url: connection }) : createClient(connection!);

	return construct(instance, DrizzleSQLiteConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): LibSQLDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
