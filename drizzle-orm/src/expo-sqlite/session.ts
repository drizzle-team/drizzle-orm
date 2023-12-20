import type { SQLiteDatabase, ResultSet, ResultSetError } from 'expo-sqlite';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import {
    type PreparedQueryConfig as PreparedQueryConfigBase,
    SQLitePreparedQuery,
    type SQLiteExecuteMethod,
    SQLiteSession,
    type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface ExpoSQLiteSessionOptions {
    logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class ExpoSQLiteSession<
    TFullSchema extends Record<string, unknown>,
    TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', ResultSet, TFullSchema, TSchema> {
    static readonly [entityKind]: string = 'ExpoSQLiteSession';

    private logger: Logger;

    constructor(
        private client: SQLiteDatabase,
        dialect: SQLiteAsyncDialect,
        private schema: RelationalSchemaConfig<TSchema> | undefined,
        options: ExpoSQLiteSessionOptions = {},

    ) {
        super(dialect);
        this.logger = options.logger ?? new NoopLogger();
    }

    prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
        query: Query,
        fields: SelectedFieldsOrdered | undefined,
        executeMethod: SQLiteExecuteMethod,
        customResultMapper?: (rows: unknown[][]) => unknown,
    ): ExpoSQLitePreparedQuery<T> {
        return new ExpoSQLitePreparedQuery(this.client, query, this.logger, fields, executeMethod, customResultMapper);
    }

    override async transaction<T>(
        transaction: (tx: ExpoSQLiteTransaction<TFullSchema, TSchema>) => T | Promise<T>,
        config: SQLiteTransactionConfig = {},
    ): Promise<T> {
        const tx = new ExpoSQLiteTransaction('async', this.dialect, this, this.schema);
        await this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
        try {
            const result = await transaction(tx);
            await this.run(sql`commit`);
            return result;
        } catch (err) {
            await this.run(sql`rollback`);
            throw err;
        }
    }
}

export class ExpoSQLiteTransaction<
    TFullSchema extends Record<string, unknown>,
    TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', ResultSet, TFullSchema, TSchema> {
    static readonly [entityKind]: string = 'ExpoSQLiteTransaction';

    override transaction<T>(transaction: (tx: ExpoSQLiteTransaction<TFullSchema, TSchema>) => T): T {
        const savepointName = `sp${this.nestedIndex}`;
        const tx = new ExpoSQLiteTransaction('async', this.dialect, this.session, this.schema, this.nestedIndex + 1);
        this.session.run(sql.raw(`savepoint ${savepointName}`));
        try {
            const result = transaction(tx);
            this.session.run(sql.raw(`release savepoint ${savepointName}`));
            return result;
        } catch (err) {
            this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
            throw err;
        }
    }
}

export class ExpoSQLitePreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<
    { type: 'async'; run: ResultSet | ResultSetError; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
    static readonly [entityKind]: string = 'ExpoSQLitePreparedQuery';

    constructor(
        private client: SQLiteDatabase,
        query: Query,
        private logger: Logger,
        private fields: SelectedFieldsOrdered | undefined,
        executeMethod: SQLiteExecuteMethod,
        private customResultMapper?: (rows: unknown[][]) => unknown,
    ) {
        super('async', executeMethod, query);
    }

    async run(placeholderValues?: Record<string, unknown>): Promise<ResultSet | ResultSetError> {
        const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
        this.logger.logQuery(this.query.sql, params);
        const [result] = await this.client.execAsync([
            {
                sql: this.query.sql,
                args: params,
            }
        ], false);
        return result as ResultSet | ResultSetError;
    }

    async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
        const { fields, joinsNotNullableMap, query, logger, client, customResultMapper } = this;
        if (!fields && !customResultMapper) {
            const params = fillPlaceholders(query.params, placeholderValues ?? {});
            logger.logQuery(query.sql, params);
            const results = await client.execAsync([
                {
                    sql: query.sql,
                    args: params,
                }
            ], false);
            const result = results[0] as ResultSet | ResultSetError;
            if ('error' in result) {
                throw result.error;
            }
            return result.rows;
        }

        const rows = await this.values(placeholderValues) as unknown[][];
        if (customResultMapper) {
            return customResultMapper(rows) as T['all'];
        }
        return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
    }

    async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
        const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
        this.logger.logQuery(this.query.sql, params);

        const { fields, client, joinsNotNullableMap, customResultMapper, query } = this;
        if (!fields && !customResultMapper) {
            const results = await client.execAsync([
                {
                    sql: query.sql,
                    args: params,
                }
            ], false);
            const result = results[0] as ResultSet | ResultSetError;
            if ('error' in result) {
                throw result.error;
            }
            return result.rows[0];
        }

        const rows = await this.values(placeholderValues) as unknown[][];
        const row = rows[0];

        if (!row) {
            return undefined;
        }

        if (customResultMapper) {
            return customResultMapper(rows) as T['get'];
        }

        return mapResultRow(fields!, row, joinsNotNullableMap);
    }

    async values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
        const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
        this.logger.logQuery(this.query.sql, params);
        const results = await this.client.execAsync([
            {
                sql: this.query.sql,
                args: params,
            }
        ], false);
        const result = results[0] as ResultSet | ResultSetError;
        if ('error' in result) {
            throw result.error;
        }
        return result.rows.map((row) => Object.values(row));
    }
}
