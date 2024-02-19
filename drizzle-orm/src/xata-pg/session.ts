import { Client, Pool, PoolClient, QueryArrayConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type XataClient = Pool | PoolClient | Client;

export class XataPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
  static readonly [entityKind]: string = 'XataPreparedQuery';

  private rawQueryConfig: QueryConfig;
  private queryConfig: QueryArrayConfig;

  constructor(
    private client: XataClient,
    queryString: string,
    private params: unknown[],
    private logger: Logger,
    private fields: SelectedFieldsOrdered | undefined,
    name: string | undefined,
    private customResultMapper?: (rows: unknown[][]) => T['execute']
  ) {
    super({ sql: queryString, params });
    this.rawQueryConfig = {
      name,
      text: queryString
    };
    this.queryConfig = {
      name,
      text: queryString,
      rowMode: 'array'
    };
  }

  async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
    const params = fillPlaceholders(this.params, placeholderValues);

    this.logger.logQuery(this.rawQueryConfig.text, params);

    const { fields, client, rawQueryConfig: rawQuery, queryConfig: query, joinsNotNullableMap, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      return await client.query(rawQuery, params);
    }

    const result = await client.query(query, params);

    return customResultMapper ? customResultMapper(result.rows) : result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
  }

  all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
    const params = fillPlaceholders(this.params, placeholderValues);
    this.logger.logQuery(this.rawQueryConfig.text, params);
    return this.client.query(this.rawQueryConfig, params).then((result) => result.rows);
  }

  values(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['values']> {
    const params = fillPlaceholders(this.params, placeholderValues);
    this.logger.logQuery(this.rawQueryConfig.text, params);
    return this.client.query(this.queryConfig, params).then((result) => result.rows);
  }
}

export interface XataSessionOptions {
  logger?: Logger;
}

export class XataSession<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig> extends PgSession<
  XataQueryResultHKT,
  TFullSchema,
  TSchema
> {
  static readonly [entityKind]: string = 'XataSession';

  private logger: Logger;

  constructor(
    private client: XataClient,
    dialect: PgDialect,
    private schema: RelationalSchemaConfig<TSchema> | undefined,
    private options: XataSessionOptions = {}
  ) {
    super(dialect);
    this.logger = options.logger ?? new NoopLogger();
  }

  prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    name: string | undefined,
    customResultMapper?: (rows: unknown[][]) => T['execute']
  ): PgPreparedQuery<T> {
    return new XataPreparedQuery(this.client, query.sql, query.params, this.logger, fields, name, customResultMapper);
  }

  async query(query: string, params: unknown[]): Promise<QueryResult> {
    this.logger.logQuery(query, params);
    return await this.client.query({ rowMode: 'array', text: query, values: params });
  }

  async queryObjects<T extends QueryResultRow>(query: string, params: unknown[]): Promise<QueryResult<T>> {
    return await this.client.query<T>(query, params);
  }

  override async transaction<T>(transaction: (tx: XataTransaction<TFullSchema, TSchema>) => Promise<T>, config: PgTransactionConfig = {}): Promise<T> {
    const session =
      this.client instanceof Pool // eslint-disable-line no-instanceof/no-instanceof
        ? new XataSession(await this.client.connect(), this.dialect, this.schema, this.options)
        : this;
    const tx = new XataTransaction(this.dialect, session, this.schema);
    await tx.execute(sql`begin ${tx.getTransactionConfigSQL(config)}`);
    try {
      const result = await transaction(tx);
      await tx.execute(sql`commit`);
      return result;
    } catch (error) {
      await tx.execute(sql`rollback`);
      throw error;
    } finally {
      if (this.client instanceof Pool) {
        // eslint-disable-line no-instanceof/no-instanceof
        (session.client as PoolClient).release();
      }
    }
  }
}

export class XataTransaction<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig> extends PgTransaction<
  XataQueryResultHKT,
  TFullSchema,
  TSchema
> {
  static readonly [entityKind]: string = 'XataTransaction';

  override async transaction<T>(transaction: (tx: XataTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
    const savepointName = `sp${this.nestedIndex + 1}`;
    const tx = new XataTransaction(this.dialect, this.session, this.schema, this.nestedIndex + 1);
    await tx.execute(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = await transaction(tx);
      await tx.execute(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (e) {
      await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
      throw e;
    }
  }
}

export interface XataQueryResultHKT extends QueryResultHKT {
  type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
