import type { OPSQLiteConnection, QueryResult } from '@op-engineering/op-sqlite';
import { DefaultLogger } from '~/logger.ts';
import {
    createTableRelationsHelpers,
    extractTablesRelationalConfig,
    type RelationalSchemaConfig,
    type TablesRelationalConfig,
} from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { OPSQLiteSession } from './session.ts';

export type OPSQLiteDatabase<
    TSchema extends Record<string, unknown> = Record<string, never>,
> = BaseSQLiteDatabase<'async', QueryResult, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
    client: OPSQLiteConnection,
    config: DrizzleConfig<TSchema> = {},
): OPSQLiteDatabase<TSchema> {
    const dialect = new SQLiteAsyncDialect();
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

    const session = new OPSQLiteSession(client, dialect, schema, { logger });
    return new BaseSQLiteDatabase('async', dialect, session, schema) as OPSQLiteDatabase<TSchema>;
}