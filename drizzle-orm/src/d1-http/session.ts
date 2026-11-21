import type { BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
    PreparedQueryConfig as PreparedQueryConfigBase,
    SQLiteExecuteMethod,
    SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';
import type { D1HttpCredentials, D1HttpResult } from './driver.ts';

// Define fetch function type to avoid dependency on @cloudflare/workers-types
type FetchFunction = (
    input: string,
    init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }
) => Promise<{
    json(): Promise<any>;
    ok: boolean;
    status: number;
}>;

const globalFetch = (globalThis as any).fetch as FetchFunction;

export interface D1HttpSessionOptions {
    logger?: Logger;
    cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

type D1ApiResponse =
    | {
          success: true;
          result: Array<{
              results:
                  | any[]
                  | {
                        columns: string[];
                        rows: any[][];
                    };
              meta: {
                  changed_db: boolean;
                  changes: number;
                  duration: number;
                  last_row_id: number;
                  rows_read: number;
                  rows_written: number;
                  served_by_primary: boolean;
                  served_by_region: string;
                  size_after: number;
                  timings: {
                      sql_duration_ms: number;
                  };
              };
              success: boolean;
          }>;
      }
    | {
          success: false;
          errors: Array<{ code: number; message: string }>;
      };

export class D1HttpSession<
    TFullSchema extends Record<string, unknown>,
    TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', D1HttpResult, TFullSchema, TSchema> {
    static override readonly [entityKind]: string = 'D1HttpSession';

    private logger: Logger;
    private cache: Cache;

    constructor(
        private credentials: D1HttpCredentials,
        dialect: SQLiteAsyncDialect,
        private schema: RelationalSchemaConfig<TSchema> | undefined,
        private options: D1HttpSessionOptions = {}
    ) {
        super(dialect);
        this.logger = options.logger ?? new NoopLogger();
        this.cache = options.cache ?? new NoopCache();
    }

    prepareQuery(
        query: Query,
        fields: SelectedFieldsOrdered | undefined,
        executeMethod: SQLiteExecuteMethod,
        isResponseInArrayMode: boolean,
        customResultMapper?: (rows: unknown[][]) => unknown,
        queryMetadata?: {
            type: 'select' | 'update' | 'delete' | 'insert';
            tables: string[];
        },
        cacheConfig?: WithCacheConfig
    ): D1HttpPreparedQuery {
        return new D1HttpPreparedQuery(
            this,
            query,
            this.logger,
            this.cache,
            queryMetadata,
            cacheConfig,
            fields,
            executeMethod,
            isResponseInArrayMode,
            customResultMapper
        );
    }

    async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T) {
        // D1 batch limit: 300+ operations tested successfully, using 250 for safety margin
        const MAX_BATCH_SIZE = 250;
        const results: any[] = [];

        for (let i = 0; i < queries.length; i += MAX_BATCH_SIZE) {
            const chunk = queries.slice(i, i + MAX_BATCH_SIZE);
            const chunkResults = await this.executeBatchChunk(chunk);
            results.push(...chunkResults);
        }

        return results as any;
    }

    private async executeBatchChunk<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T) {
        // D1 batch API limitation: requires single SQL string with manual parameter substitution
        const preparedQueries: PreparedQuery[] = [];
        const builtQueries: { sql: string }[] = [];

        for (const query of queries) {
            const preparedQuery = query._prepare();
            const builtQuery = preparedQuery.getQuery();
            preparedQueries.push(preparedQuery);

            if (builtQuery.params.length > 0) {
                // Manually substitute parameters since D1 batch doesn't support separate params array
                let sql = builtQuery.sql;
                for (let i = 0; i < builtQuery.params.length; i++) {
                    const param = builtQuery.params[i];
                    const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : String(param);
                    sql = sql.replace('?', value);
                }
                builtQueries.push({ sql });
            } else {
                builtQueries.push({ sql: builtQuery.sql });
            }
        }

        // Combine all SQL statements with semicolons for D1 batch execution
        const batchSql = builtQueries.map(q => q.sql).join('; ');
        const { accountId, databaseId, token } = this.credentials;

        const response = await globalFetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ sql: batchSql }),
            }
        );

        const data = (await response.json()) as D1ApiResponse;

        if (!data.success) {
            const errorMessage = data.errors.map(error => `${error.code}: ${error.message}`).join('\n');
            throw new Error(`D1 Batch API Error: ${errorMessage}\nSQL: ${batchSql}`);
        }

        const batchResults = data.result.map(result => {
            const res = result.results;
            const rows = Array.isArray(res) ? res : res.rows;
            return { rows };
        });

        // Map D1 results back to Drizzle prepared queries
        // D1 may return more results than queries if SQL contains semicolon-separated statements
        return preparedQueries.map((preparedQuery, i) => {
            if (!preparedQuery) {
                throw new Error(`Missing prepared query at index ${i}`);
            }
            // Use result at same index, fallback to empty if D1 returns fewer results
            const result = batchResults[i] || { rows: [] };
            return preparedQuery.mapResult(result, true);
        });
    }

    async executeQuery(
        sql: string,
        params: unknown[],
        method: 'run' | 'all' | 'values' | 'get'
    ): Promise<D1HttpResult> {
        // D1 parameter limit: 100 per query (Cloudflare docs + empirical testing)
        // Ref: https://developers.cloudflare.com/d1/platform/limits/
        const D1_PARAMETER_LIMIT = 100;

        if (params.length > D1_PARAMETER_LIMIT && sql.toLowerCase().includes('insert into') && sql.includes('values')) {
            return this.executeChunkedInsert(sql, params, method);
        }

        const { accountId, databaseId, token } = this.credentials;

        // Use /raw endpoint for values() method (returns arrays), /query for others (returns objects)
        const endpoint = method === 'values' ? 'raw' : 'query';
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/${endpoint}`;

        const response = await globalFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ sql, params }),
        });

        const data = (await response.json()) as D1ApiResponse;

        if (!data.success) {
            const errorMessage = data.errors.map(error => `${error.code}: ${error.message}`).join('\n');
            throw new Error(`D1 API Error: ${errorMessage}\nSQL: ${sql}\nParams: ${JSON.stringify(params)}`);
        }

        const result = data.result[0]?.results;
        if (!result) {
            return { rows: [] };
        }

        // Handle both /raw (arrays) and /query (objects with rows property) response formats
        const rows = Array.isArray(result) ? result : result.rows;
        return { rows };
    }

    private async executeChunkedInsert(
        sql: string,
        params: unknown[],
        method: 'run' | 'all' | 'values' | 'get'
    ): Promise<D1HttpResult> {
        // Multi-row INSERT chunking: preserves original SQL structure (nulls, defaults)
        const insertMatch = sql.match(/insert\s+into\s+([^\s(]+)\s*\(([^)]+)\)\s+values\s+(.*)/i);
        if (!insertMatch) {
            return this.executeDirectQuery(sql, params, method);
        }

        const tableName = insertMatch[1]!;
        const columnsClause = insertMatch[2]!;
        const valuesClause = insertMatch[3]!;

        // Extract single row pattern to preserve null/default handling
        const singleRowMatch = valuesClause.match(/\([^)]+\)/);
        if (!singleRowMatch) {
            return this.executeDirectQuery(sql, params, method);
        }

        const singleRowPattern = singleRowMatch[0];
        const paramCountPerRow = (singleRowPattern.match(/\?/g) || []).length;

        if (paramCountPerRow === 0) {
            return this.executeDirectQuery(sql, params, method);
        }

        const totalRows = Math.floor(params.length / paramCountPerRow);
        const D1_PARAMETER_LIMIT = 100;
        const MAX_ROWS_PER_CHUNK = Math.floor(D1_PARAMETER_LIMIT / paramCountPerRow);

        if (MAX_ROWS_PER_CHUNK <= 0) {
            return this.executeDirectQuery(sql, params, method);
        }

        let allRows: unknown[] = [];

        for (let i = 0; i < totalRows; i += MAX_ROWS_PER_CHUNK) {
            const endRow = Math.min(i + MAX_ROWS_PER_CHUNK, totalRows);
            const chunkParams = params.slice(i * paramCountPerRow, endRow * paramCountPerRow);

            const valuesPlaceholders = [];
            for (let row = 0; row < endRow - i; row++) {
                valuesPlaceholders.push(singleRowPattern);
            }

            const chunkSql = `INSERT INTO ${tableName} (${columnsClause}) VALUES ${valuesPlaceholders.join(', ')}`;

            const chunkResult = await this.executeDirectQuery(chunkSql, chunkParams, method);
            if (chunkResult.rows) {
                allRows.push(...chunkResult.rows);
            }
        }

        return { rows: allRows };
    }

    private async executeDirectQuery(
        sql: string,
        params: unknown[],
        method: 'run' | 'all' | 'values' | 'get'
    ): Promise<D1HttpResult> {
        const { accountId, databaseId, token } = this.credentials;

        // Use /raw endpoint for values() method (returns arrays), /query for others (returns objects)
        const endpoint = method === 'values' ? 'raw' : 'query';
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/${endpoint}`;

        const response = await globalFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ sql, params }),
        });

        const data = (await response.json()) as D1ApiResponse;

        if (!data.success) {
            const errorMessage = data.errors.map(error => `${error.code}: ${error.message}`).join('\n');
            throw new Error(`D1 API Error: ${errorMessage}\nSQL: ${sql}\nParams: ${JSON.stringify(params)}`);
        }

        const result = data.result[0]?.results;
        if (!result) {
            return { rows: [] };
        }

        const rows = Array.isArray(result) ? result : result.rows;
        return { rows };
    }

    override extractRawAllValueFromBatchResult(result: unknown): unknown {
        return (result as D1HttpResult).rows;
    }

    override extractRawGetValueFromBatchResult(result: unknown): unknown {
        return (result as D1HttpResult).rows?.[0];
    }

    override extractRawValuesValueFromBatchResult(result: unknown): unknown {
        return (result as D1HttpResult).rows;
    }

    override async transaction<T>(
        transaction: (tx: D1HttpTransaction<TFullSchema, TSchema>) => T | Promise<T>,
        config?: SQLiteTransactionConfig
    ): Promise<T> {
        const tx = new D1HttpTransaction('async', this.dialect, this, this.schema);
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

export class D1HttpTransaction<
    TFullSchema extends Record<string, unknown>,
    TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', D1HttpResult, TFullSchema, TSchema> {
    static override readonly [entityKind]: string = 'D1HttpTransaction';

    override async transaction<T>(
        transaction: (tx: D1HttpTransaction<TFullSchema, TSchema>) => Promise<T>
    ): Promise<T> {
        const savepointName = `sp${this.nestedIndex}`;
        const tx = new D1HttpTransaction('async', this.dialect, this.session, this.schema, this.nestedIndex + 1);
        await this.session.run(sql.raw(`savepoint ${savepointName}`));
        try {
            const result = await transaction(tx);
            await this.session.run(sql.raw(`release savepoint ${savepointName}`));
            return result;
        } catch (err) {
            await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
            throw err;
        }
    }
}

export class D1HttpPreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<{
    type: 'async';
    run: D1HttpResult;
    all: T['all'];
    get: T['get'];
    values: T['values'];
    execute: T['execute'];
}> {
    static override readonly [entityKind]: string = 'D1HttpPreparedQuery';

    /** @internal */
    customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown;

    /** @internal */
    fields?: SelectedFieldsOrdered;

    constructor(
        private session: D1HttpSession<any, any>,
        query: Query,
        private logger: Logger,
        cache: Cache,
        queryMetadata:
            | {
                  type: 'select' | 'update' | 'delete' | 'insert';
                  tables: string[];
              }
            | undefined,
        cacheConfig: WithCacheConfig | undefined,
        fields: SelectedFieldsOrdered | undefined,
        executeMethod: SQLiteExecuteMethod,
        private _isResponseInArrayMode: boolean,
        customResultMapper?: (rows: unknown[][]) => unknown
    ) {
        super('async', executeMethod, query, cache, queryMetadata, cacheConfig);
        this.customResultMapper = customResultMapper;
        this.fields = fields;
    }

    async run(placeholderValues?: Record<string, unknown>): Promise<D1HttpResult> {
        const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
        this.logger.logQuery(this.query.sql, params);
        return await this.queryWithCache(this.query.sql, params, async () => {
            return this.session.executeQuery(this.query.sql, params, 'run');
        });
    }

    async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
        const { fields, query, logger, customResultMapper } = this;
        if (!fields && !customResultMapper) {
            const params = fillPlaceholders(query.params, placeholderValues ?? {});
            logger.logQuery(query.sql, params);
            return await this.queryWithCache(query.sql, params, async () => {
                const result = await this.session.executeQuery(query.sql, params, 'all');
                return this.mapAllResult(result.rows!);
            });
        }

        const rows = await this.values(placeholderValues);
        return this.mapAllResult(rows);
    }

    override mapAllResult(rows: unknown, isFromBatch?: boolean): unknown {
        if (isFromBatch) {
            rows = (rows as D1HttpResult).rows;
        }

        if (!this.fields && !this.customResultMapper) {
            return rows;
        }

        if (this.customResultMapper) {
            return this.customResultMapper(rows as unknown[][]);
        }

        return (rows as unknown[][]).map(row => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
    }

    async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
        const { fields, joinsNotNullableMap, query, logger, customResultMapper } = this;
        if (!fields && !customResultMapper) {
            const params = fillPlaceholders(query.params, placeholderValues ?? {});
            logger.logQuery(query.sql, params);
            return await this.queryWithCache(query.sql, params, async () => {
                const result = await this.session.executeQuery(query.sql, params, 'get');
                return result.rows?.[0];
            });
        }

        const rows = await this.values(placeholderValues);

        if (!rows[0]) {
            return undefined;
        }

        if (customResultMapper) {
            return customResultMapper(rows) as T['all'];
        }

        return mapResultRow(fields!, rows[0], joinsNotNullableMap);
    }

    override mapGetResult(result: unknown, isFromBatch?: boolean): unknown {
        if (isFromBatch) {
            result = (result as D1HttpResult).rows?.[0];
        }

        if (!this.fields && !this.customResultMapper) {
            return result;
        }

        if (this.customResultMapper) {
            return this.customResultMapper([result as unknown[]]) as T['all'];
        }

        return mapResultRow(this.fields!, result as unknown[], this.joinsNotNullableMap);
    }

    async values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
        const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
        this.logger.logQuery(this.query.sql, params);
        return await this.queryWithCache(this.query.sql, params, async () => {
            const result = await this.session.executeQuery(this.query.sql, params, 'values');
            return result.rows as T[];
        });
    }

    /** @internal */
    isResponseInArrayMode(): boolean {
        return this._isResponseInArrayMode;
    }
}
