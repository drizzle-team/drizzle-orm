import { type QueryResult, type QueryResultRow, sql, type VercelPool } from '@vercel/postgres';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/index.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig, IfNotImported, ImportTypeError } from '~/utils.ts';
import { type VercelPgClient, type VercelPgQueryResultHKT, VercelPgSession } from './session.ts';

export interface VercelPgDriverOptions {
	logger?: Logger;
}

export class VercelPgDriver {
	static readonly [entityKind]: string = 'VercelPgDriver';

	constructor(
		private client: VercelPgClient,
		private dialect: PgDialect,
		private options: VercelPgDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): VercelPgSession<Record<string, unknown>, TablesRelationalConfig> {
		return new VercelPgSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export class VercelPgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<VercelPgQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'VercelPgDatabase';
}

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: VercelPgClient,
	config: DrizzleConfig<TSchema> = {},
): VercelPgDatabase<TSchema> & {
	$client: VercelPgClient;
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

	const driver = new VercelPgDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new VercelPgDatabase(dialect, session, schema as any) as VercelPgDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

type Primitive = string | number | boolean | undefined | null;

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends VercelPgClient =
		& VercelPool
		& (<O extends QueryResultRow>(strings: TemplateStringsArray, ...values: Primitive[]) => Promise<QueryResult<O>>),
>(
	...params: IfNotImported<
		VercelPool,
		[ImportTypeError<'@vercel/postgres'>],
		[] | [
			TClient,
		] | [
			TClient,
			DrizzleConfig<TSchema>,
		] | [
			(
				& DrizzleConfig<TSchema>
				& ({
					connection?: TClient;
				})
			),
		]
	>
): VercelPgDatabase<TSchema> & {
	$client: TClient;
} {
	// eslint-disable-next-line no-instanceof/no-instanceof
	if (typeof params[0] === 'function') {
		return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

	if (!params[0] || !(params[0] as { connection?: TClient }).connection) {
		return construct(sql, params[0] as DrizzleConfig<TSchema> | undefined) as any;
	}

	const { connection, ...drizzleConfig } = params[0] as ({ connection: TClient } & DrizzleConfig<TSchema>);
	return construct(connection, drizzleConfig) as any;
}

drizzle(sql, {
	logger: true,
	casing: 'camelCase',
});
