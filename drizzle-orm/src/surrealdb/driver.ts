import type { Surreal } from 'surrealdb';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { SurrealDBDatabase } from '~/surrealdb-core/db.ts';
import { SurrealDBDialect } from '~/surrealdb-core/dialect.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type {
	SurrealDBDriverClient,
	SurrealDBDriverPreparedQueryHKT,
	SurrealDBDriverQueryResultHKT,
} from './session.ts';
import { SurrealDBDriverSession } from './session.ts';

export interface SurrealDBDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class SurrealDBDriverDriver {
	static readonly [entityKind]: string = 'SurrealDBDriverDriver';

	constructor(
		private client: SurrealDBDriverClient,
		private dialect: SurrealDBDialect,
		private options: SurrealDBDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): SurrealDBDriverSession<Record<string, unknown>, TablesRelationalConfig> {
		return new SurrealDBDriverSession(this.client, this.dialect, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}
}

export { SurrealDBDatabase } from '~/surrealdb-core/db.ts';

export class SurrealDBDriverDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends SurrealDBDatabase<SurrealDBDriverQueryResultHKT, SurrealDBDriverPreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'SurrealDBDriverDatabase';
}

export type SurrealDBDriverDrizzleConfig<TSchema extends Record<string, unknown> = Record<string, never>> =
	& Omit<DrizzleConfig<TSchema>, 'schema'>
	& ({ schema: TSchema } | { schema?: undefined });

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	client: Surreal,
	config: SurrealDBDriverDrizzleConfig<TSchema> = {},
): SurrealDBDriverDatabase<TSchema> & {
	$client: Surreal;
} {
	const dialect = new SurrealDBDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(
			config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const driver = new SurrealDBDriverDriver(client, dialect, {
		logger,
		cache: config.cache,
	});
	const session = driver.createSession(schema);
	const db = new SurrealDBDriverDatabase(dialect, session, schema as any) as SurrealDBDriverDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	...params: [
		Surreal,
	] | [
		Surreal,
		SurrealDBDriverDrizzleConfig<TSchema>,
	] | [
		(
			& SurrealDBDriverDrizzleConfig<TSchema>
			& {
				client: Surreal;
			}
		),
	]
): SurrealDBDriverDatabase<TSchema> & {
	$client: Surreal;
} {
	if (isConfig(params[0])) {
		const { client, ...drizzleConfig } = params[0] as
			& { client: Surreal }
			& SurrealDBDriverDrizzleConfig<TSchema>;
		return construct(client, drizzleConfig) as any;
	}

	return construct(params[0] as Surreal, params[1] as SurrealDBDriverDrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: SurrealDBDriverDrizzleConfig<TSchema>,
	): SurrealDBDriverDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
