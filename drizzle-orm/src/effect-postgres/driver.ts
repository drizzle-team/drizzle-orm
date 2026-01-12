import type { PgClient } from '@effect/sql-pg/PgClient';
import * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { _RelationalQueryBuilder } from '~/pg-core/query-builders/_query.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type EffectPgQueryResultHKT, EffectPgSession } from './session.ts';

export class EffectPgDatabase<
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgEffectDatabase<EffectPgQueryResultHKT, TFullSchema, TRelations> {
	static override readonly [entityKind]: string = 'EffectPgDatabase';
}

export type EffectDrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> =
	& Omit<DrizzleConfig<TSchema, TRelations>, 'cache'>
	& {
		cache?: EffectCache;
	};

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PgClient = PgClient,
>(
	client: TClient,
	config: EffectDrizzleConfig<TSchema, TRelations> = {},
): EffectPgDatabase<TSchema, TRelations> & {
	$client: PgClient;
} {
	const dialect = new PgDialect({ casing: config.casing });

	// TODO: implement effect ver
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
	const session = new EffectPgSession(client, dialect, relations, schema, { logger });
	const db = new EffectPgDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as EffectPgDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(client: PgClient, config?: EffectDrizzleConfig<TSchema, TRelations>): EffectPgDatabase<TSchema, TRelations> & {
	$client: PgClient;
} {
	return construct(client, config);
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: EffectDrizzleConfig<TSchema, TRelations>,
	): EffectPgDatabase<TSchema, TRelations> {
		return construct({} as any, config) as any;
	}
}
