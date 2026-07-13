import { DatabaseSync, type DatabaseSyncOptions } from 'node:sqlite';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type NodeSQLiteRunResult, NodeSQLiteSession } from './session.ts';

export class NodeSQLiteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'sync', NodeSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'NodeSQLiteDatabase';
}

export type DrizzleNodeSQLiteDatabaseConfig =
	| ({
		path?: string;
	} & DatabaseSyncOptions)
	| string
	| undefined;

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: DatabaseSync,
	config: DrizzleSQLiteConfig<TRelations> = {},
): NodeSQLiteDatabase<TRelations> & {
	$client: DatabaseSync;
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
	const session = new NodeSQLiteSession(client, dialect, relations, {
		logger,
	});
	const db = new NodeSQLiteDatabase(
		'sync',
		dialect,
		session,
		relations,
	);
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<TRelations extends AnyRelations = EmptyRelations, TClient extends DatabaseSync = DatabaseSync>(
	...params:
		| []
		| [
			string,
		]
		| [
			string,
			DrizzleSQLiteConfig<TRelations>,
		]
		| [
			(
				& DrizzleSQLiteConfig<TRelations>
				& ({
					connection?: DrizzleNodeSQLiteDatabaseConfig | string;
				} | {
					client: TClient;
				})
			),
		]
): NodeSQLiteDatabase<TRelations> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = params[0] === undefined ? new DatabaseSync(':memory:') : new DatabaseSync(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...config } = params[0] as
		& ({
			connection?: DrizzleNodeSQLiteDatabaseConfig | string;
			client?: TClient;
		})
		& DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, config) as any;

	if (typeof connection === 'object') {
		const { path, ...options } = connection;

		const instance = new DatabaseSync(path ?? ':memory:', options);

		return construct(instance, config) as any;
	}

	const instance = new DatabaseSync(connection ?? ':memory:');

	return construct(instance, config) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): NodeSQLiteDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
