import { Database, type DatabaseOpts } from '@tursodatabase/sync';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { TursoDatabaseSyncSession } from './session.ts';

export type TursoDatabaseSyncRunResult = Awaited<ReturnType<Database['run']>>;

export class TursoDatabaseSyncDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', TursoDatabaseSyncRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'TursoDatabaseSyncDatabase';

	/** @internal */
	declare readonly session: TursoDatabaseSyncSession<TRelations>;
}

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: Database,
	config: DrizzleSQLiteConfig<TRelations> = {},
): TursoDatabaseSyncDatabase<TRelations> & {
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
	const session = new TursoDatabaseSyncSession(
		client,
		dialect,
		relations,
		{ logger, cache: config.cache },
	);
	const db = new TursoDatabaseSyncDatabase(
		'async',
		dialect,
		session,
		relations,
	) as TursoDatabaseSyncDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}

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
): TursoDatabaseSyncDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Database({
			path: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& { connection?: string | DatabaseOpts; client?: TClient }
		& DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	const instance = typeof connection === 'string'
		? new Database({ path: connection })
		: new Database(connection!);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): TursoDatabaseSyncDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
