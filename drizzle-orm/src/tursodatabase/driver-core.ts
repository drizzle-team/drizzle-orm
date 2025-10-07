import type { DatabasePromise } from '@tursodatabase/database-common';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { TursoDatabaseSession } from './session.ts';

export type TursoDatabaseRunResult = Awaited<ReturnType<ReturnType<DatabasePromise['prepare']>['run']>>;

export class TursoDatabaseDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'async', TursoDatabaseRunResult, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'TursoDatabaseDatabase';

	/** @internal */
	declare readonly session: TursoDatabaseSession<
		TSchema,
		TRelations,
		V1.ExtractTablesWithRelations<TSchema>
	>;
}

/** @internal */
export function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: DatabasePromise,
	config: DrizzleConfig<TSchema, TRelations> = {},
): TursoDatabaseDatabase<TSchema, TRelations> & {
	$client: DatabasePromise;
} {
	const dialect = new SQLiteAsyncDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(
			config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new TursoDatabaseSession(
		client,
		dialect,
		relations,
		schema,
		{ logger, cache: config.cache },
	);
	const db = new TursoDatabaseDatabase(
		'async',
		dialect,
		session as TursoDatabaseSession<
			TSchema,
			TRelations,
			V1.ExtractTablesWithRelations<TSchema>
		>,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as TursoDatabaseDatabase<TSchema, TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}
