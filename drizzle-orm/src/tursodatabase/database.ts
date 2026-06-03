import { Database } from '@tursodatabase/database';
import type { DatabaseOpts } from '@tursodatabase/database-common';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { construct, type TursoDatabaseDatabase } from './driver-core.ts';

export type DatabaseOptions = DatabaseOpts & {
	path: string;
};

export function drizzle<TRelations extends AnyRelations = EmptyRelations, TClient extends Database = Database>(
	...params: [
		string,
	] | [
		string,
		DrizzleSQLiteConfig<TRelations>,
	] | [
		(
			& DrizzleSQLiteConfig<TRelations>
			& ({
				connection: string | DatabaseOptions;
			} | {
				client: TClient;
			})
		),
	]
): TursoDatabaseDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Database(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleSQLiteConfig } = params[0] as
		& { connection?: DatabaseOptions | string; client?: TClient }
		& DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, DrizzleSQLiteConfig) as any;

	const instance = typeof connection === 'string'
		? new Database(connection)
		: new Database(connection!.path, connection);

	return construct(instance, DrizzleSQLiteConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): TursoDatabaseDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
