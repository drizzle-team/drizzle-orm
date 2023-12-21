import type { OPSQLiteConnection, QueryResult, PreparedStatementObj } from '@op-engineering/op-sqlite';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
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

export interface OPSQLiteSessionOptions {
    logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class OPSQLiteSession<
    TFullSchema extends Record<string, unknown>,
    TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', QueryResult, TFullSchema, TSchema> {
    static readonly [entityKind]: string = 'OPSQLiteSession';

    private logger: Logger;

    constructor(
        private client: OPSQLiteConnection,
        dialect: SQLiteSyncDialect,
        private schema: RelationalSchemaConfig<TSchema> | undefined,
        options: OPSQLiteSessionOptions = {},

    ) {
        super(dialect);
        this.logger = options.logger ?? new NoopLogger();
    }

    prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
        query: Query,
        fields: SelectedFieldsOrdered | undefined,
        executeMethod: SQLiteExecuteMethod,
        customResultMapper?: (rows: unknown[][]) => unknown,
    ): OPSQLitePreparedQuery<T> {
        const stmt = this.client.prepareStatement(query.sql);
        return new OPSQLitePreparedQuery(stmt, query, this.logger, fields, executeMethod, customResultMapper);
    }

    override transaction<T>(
        transaction: (tx: OPSQLiteTransaction<TFullSchema, TSchema>) => T,
        config: SQLiteTransactionConfig = {},
    ): T {
        const tx = new OPSQLiteTransaction('sync', this.dialect, this, this.schema);
        this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
        try {
            const result = transaction(tx);
            this.run(sql`commit`);
            return result;
        } catch (err) {
            this.run(sql`rollback`);
            throw err;
        }
    }
}

export class OPSQLiteTransaction<
    TFullSchema extends Record<string, unknown>,
    TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', QueryResult, TFullSchema, TSchema> {
    static readonly [entityKind]: string = 'OPSQLiteTransaction';

    override transaction<T>(transaction: (tx: OPSQLiteTransaction<TFullSchema, TSchema>) => T): T {
        const savepointName = `sp${this.nestedIndex}`;
        const tx = new OPSQLiteTransaction('sync', this.dialect, this.session, this.schema, this.nestedIndex + 1);
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

export class OPSQLitePreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<
    { type: 'sync'; run: QueryResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
    static readonly [entityKind]: string = 'OPSQLitePreparedQuery';

    constructor(
		private stmt: PreparedStatementObj,
        query: Query,
        private logger: Logger,
        private fields: SelectedFieldsOrdered | undefined,
        executeMethod: SQLiteExecuteMethod,
        private customResultMapper?: (rows: unknown[][]) => unknown,
    ) {
        super('sync', executeMethod, query);
    }

    run(placeholderValues?: Record<string, unknown>): QueryResult {
        const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
        this.logger.logQuery(this.query.sql, params);
        this.stmt.bind(params);
		return this.stmt.execute();
    }

    all(placeholderValues?: Record<string, unknown>): T['all'] {
        const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
        if (!fields && !customResultMapper) {
            const params = fillPlaceholders(query.params, placeholderValues ?? {});
            logger.logQuery(query.sql, params);
            stmt.bind(params);
            return stmt.execute().rows?._array || [];
        }

        const rows = this.values(placeholderValues) as unknown[][];
        if (customResultMapper) {
            return customResultMapper(rows) as T['all'];
        }
        return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
    }

    get(placeholderValues?: Record<string, unknown>): T['get'] {
        const { fields, stmt, joinsNotNullableMap, customResultMapper, query } = this;
        const params = fillPlaceholders(query.params, placeholderValues ?? {});
        this.logger.logQuery(query.sql, params);
        stmt.bind(params);
        if (!fields && !customResultMapper) {
            const rows = stmt.execute().rows?._array || [];
            return rows[0];
        }

        const rows = this.values(placeholderValues) as unknown[][];
        const row = rows[0];

        if (!row) {
            return undefined;
        }

        if (customResultMapper) {
            return customResultMapper(rows) as T['get'];
        }

        return mapResultRow(fields!, row, joinsNotNullableMap);
    }

    values(placeholderValues?: Record<string, unknown>): T['values'] {
        const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
        this.logger.logQuery(this.query.sql, params);
        this.stmt.bind(params);
        const rows = this.stmt.execute().rows?._array || [];
        return rows.map((row) => Object.values({ ...row }));
    }
}
