import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type DrizzleConfig, type IfNotImported, type ImportTypeError, isConfig } from '~/utils.ts';
import type { PgliteClient, PgliteQueryResultHKT } from './session.ts';
import { PgliteSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
}

export class PgliteDriver {
	static readonly [entityKind]: string = 'PgliteDriver';

	constructor(
		private client: PgliteClient,
		private dialect: PgDialect,
		private options: PgDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): PgliteSession<Record<string, unknown>, TablesRelationalConfig> {
		return new PgliteSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export class PgliteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<PgliteQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'PgliteDatabase';
}

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: PgliteClient,
	config: DrizzleConfig<TSchema> = {},
): PgliteDatabase<TSchema> & {
	$client: PgliteClient;
} {
	const dialect = new PgDialect({ casing: config.casing });
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

	const driver = new PgliteDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new PgliteDatabase(dialect, session, schema as any) as PgliteDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends PGlite = PGlite,
>(
	...params: IfNotImported<
		PGlite,
		[ImportTypeError<'@electric-sql/pglite'>],
		| []
		| [
			TClient | string,
		]
		| [
			TClient | string,
			DrizzleConfig<TSchema>,
		]
		| [
			(
				& DrizzleConfig<TSchema>
				& ({
					connection?: (PGliteOptions & { dataDir?: string }) | string;
				} | {
					client: TClient;
				})
			),
		]
	>
): PgliteDatabase<TSchema> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = new PGlite(params[0]);
		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as {
			connection?: PGliteOptions & { dataDir: string };
			client?: TClient;
		} & DrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig) as any;

		if (typeof connection === 'object') {
			const { dataDir, ...options } = connection;

			const instance = new PGlite(dataDir, options);

			return construct(instance, drizzleConfig) as any;
		}

		const instance = new PGlite(connection);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): PgliteDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
