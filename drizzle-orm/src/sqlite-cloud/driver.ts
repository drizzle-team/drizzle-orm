import { Database } from '@sqlitecloud/drivers';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { SQLiteCloudSession } from './session.ts';

export type SQLiteCloudRunResult = unknown;

export class SQLiteCloudDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', SQLiteCloudRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLiteCloudDatabase';

	/** @internal */
	declare readonly session: SQLiteCloudSession<TRelations>;
}

/** @internal */
export function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: Database,
	config: DrizzleSQLiteConfig<TRelations> = {},
): SQLiteCloudDatabase<TRelations> & {
	$client: Database;
} {
	const dialect = new SQLiteDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new SQLiteCloudSession(
		client,
		dialect,
		relations,
		{ logger, cache: config.cache },
	);
	const db = new SQLiteCloudDatabase('async', dialect, session, relations);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}

export type DatabaseOpts = (Database extends { new(path: string, opts: infer D): any } ? D : any) & {
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
				connection: string | DatabaseOpts;
			} | {
				client: TClient;
			})
		),
	]
): SQLiteCloudDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Database(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleSQLiteConfig } = params[0] as
		& { connection?: DatabaseOpts; client?: TClient }
		& DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, DrizzleSQLiteConfig) as any;

	const instance = typeof connection === 'string'
		? new Database(connection)
		: new Database(connection.path, connection);

	return construct(instance, DrizzleSQLiteConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): SQLiteCloudDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
