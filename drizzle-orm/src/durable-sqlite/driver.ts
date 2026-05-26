/// <reference types="@cloudflare/workers-types" />
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { type DurableSQLiteRunResult, SQLiteDOSession } from './session.ts';

export class DrizzleSqliteDODatabase<TRelations extends AnyRelations = EmptyRelations>
	extends BaseSQLiteDatabase<'sync', DurableSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'DrizzleSqliteDODatabase';

	/** @internal */
	declare readonly session: SQLiteDOSession<TRelations>;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends DurableObjectStorage = DurableObjectStorage,
>(
	client: TClient,
	config: Omit<DrizzleSQLiteConfig<TRelations>, 'jit'> = {},
): DrizzleSqliteDODatabase<TRelations> & {
	$client: TClient;
} {
	const dialect = new SQLiteSyncDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new SQLiteDOSession(client as DurableObjectStorage, dialect, relations, {
		logger,
	});
	const db = new DrizzleSqliteDODatabase(
		'sync',
		dialect,
		session,
		relations,
		false,
		true,
	);
	(<any> db).$client = client;

	return db as any;
}
