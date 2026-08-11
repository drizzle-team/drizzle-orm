import type { ClickHouseClient, ClickHouseSettings } from '@clickhouse/client';
import { Readable } from 'node:stream';
import type { Cache } from '~/cache/core/cache.ts';
import { NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { ClickHouseDialect } from '~/clickhouse-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/clickhouse-core/query-builders/select.types.ts';
import { ClickHouseInsertValueError } from '~/clickhouse-core/errors.ts';
import { CLICKHOUSE_INSERT_FORMAT as INSERT_FORMAT } from '~/clickhouse-core/query-builders/insert.ts';
import {
	ClickHousePreparedQuery as PreparedQueryBase,
	type ClickHousePreparedQueryConfig,
	type ClickHousePreparedQueryHKT,
	type ClickHouseQueryMetadata,
	type ClickHouseQueryResultHKT,
	ClickHouseSession,
	type PreparedQueryKind,
} from '~/clickhouse-core/session.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

/**
 * The subset of `@clickhouse/client` Drizzle depends on, so that any compatible client works.
 *
 * `insert` is here because a row-format insert is not a statement the query interface can carry — the
 * driver has to write the rows to the request body itself. Both the Node and the web builds provide
 * it with the same signature.
 */
export type ClickHouseDriverClient = Pick<ClickHouseClient, 'query' | 'command' | 'close' | 'insert'>;

/**
 * The result of a statement that does not return rows — an insert, a mutation or DDL.
 *
 * `statistics` is ClickHouse's own accounting for the statement and is worth logging on expensive
 * queries; it is absent for statements issued through the command interface.
 */
export interface ClickHouseQueryResult<TRow = never> {
	rows: TRow[];
	/** ClickHouse's id for the statement, which `system.query_log` can be joined on. */
	query_id: string;
	statistics?: {
		elapsed: number;
		rows_read: number;
		bytes_read: number;
	};
}

/**
 * Format settings Drizzle relies on for unambiguous decoding.
 *
 * `date_time_output_format: 'iso'` makes ClickHouse render `DateTime`/`DateTime64` with an explicit
 * zone, so a `Date` can be reconstructed without having to know the column's or the server's
 * timezone. Callers can still override it per query.
 */
export const DRIZZLE_CLICKHOUSE_SETTINGS: ClickHouseSettings = {
	date_time_output_format: 'iso',
};

/** Statements that produce a result set, and so go through `query` rather than `command`. */
const ROW_RETURNING = /^\s*(?:\(|select|with|show|describe|desc|explain|exists|values)\b/i;

export interface ClickHouseDriverSessionOptions {
	logger?: Logger;
	cache?: Cache;
	/** Settings applied to every statement, merged over {@link DRIZZLE_CLICKHOUSE_SETTINGS}. */
	settings?: ClickHouseSettings;
}

/**
 * Adapts an async iterable of rows to what `@clickhouse/client` takes.
 *
 * The client accepts a `Readable` and, when it is in **object mode**, JSON-encodes each value as it
 * flows — so the batch is never a single string in this process and back-pressure from the socket
 * reaches the source. `Readable.from` defaults to object mode, which is the mode a `JSON*` format
 * requires; handing it a non-object-mode stream is an error the client raises by name.
 *
 * This binding already targets the Node build of the client (`driver.ts` imports `createClient` from
 * `@clickhouse/client`), so `node:stream` is no new constraint.
 */
function toInsertStream(rows: AsyncIterable<Record<string, unknown>>): Readable {
	return Readable.from(rows);
}

export class ClickHouseDriverPreparedQuery<T extends ClickHousePreparedQueryConfig> extends PreparedQueryBase<T> {
	static override readonly [entityKind]: string = 'ClickHouseDriverPreparedQuery';

	constructor(
		private client: ClickHouseDriverClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper: ((rows: unknown[][]) => T['execute']) | undefined,
		private settings: ClickHouseSettings,
		cache: Cache,
		queryMetadata: ClickHouseQueryMetadata | undefined,
		cacheConfig: WithCacheConfig | undefined,
	) {
		super(cache, queryMetadata, cacheConfig);
	}

	async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);

		const { fields, customResultMapper, client, queryString, settings } = this;

		if (!fields && !customResultMapper) {
			return this.queryWithCache(queryString, params, async () => {
				if (ROW_RETURNING.test(queryString)) {
					const resultSet = await client.query({
						query: queryString,
						format: 'JSON',
						clickhouse_settings: settings,
					});
					const response = await resultSet.json<Record<string, unknown>>();
					return {
						rows: response.data,
						query_id: resultSet.query_id,
						statistics: response.statistics,
					} as T['execute'];
				}

				const result = await client.command({ query: queryString, clickhouse_settings: settings });
				return { rows: [], query_id: result.query_id } as T['execute'];
			});
		}

		return this.queryWithCache(queryString, params, async () => {
			// `JSONCompact` returns each row as an array of values in the projection's order, which is
			// exactly the shape `mapResultRow` expects.
			const resultSet = await client.query({
				query: queryString,
				format: 'JSONCompact',
				clickhouse_settings: settings,
			});
			const { data } = await resultSet.json<unknown[]>();
			const rows = data as unknown[][];

			if (customResultMapper) {
				return customResultMapper(rows);
			}

			return rows.map((row) => mapResultRow<T['execute']>(fields!, row, this.joinsNotNullableMap));
		});
	}

	async *iterator(placeholderValues: Record<string, unknown> = {}): AsyncGenerator<T['iterator']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);

		const resultSet = await this.client.query({
			query: this.queryString,
			format: 'JSONCompactEachRow',
			clickhouse_settings: this.settings,
		});

		for await (const chunk of resultSet.stream<unknown[]>()) {
			for (const row of chunk) {
				const values = row.json() as unknown[];
				yield (this.fields
					? mapResultRow(this.fields, values, this.joinsNotNullableMap)
					: values) as T['iterator'];
			}
		}
	}
}

export class ClickHouseDriverSession extends ClickHouseSession<
	ClickHouseDriverQueryResultHKT,
	ClickHouseDriverPreparedQueryHKT
> {
	static override readonly [entityKind]: string = 'ClickHouseDriverSession';

	private logger: Logger;
	private cache: Cache;
	private settings: ClickHouseSettings;

	constructor(
		private client: ClickHouseDriverClient,
		dialect: ClickHouseDialect,
		private options: ClickHouseDriverSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
		this.settings = { ...DRIZZLE_CLICKHOUSE_SETTINGS, ...options.settings };
	}

	prepareQuery<T extends ClickHousePreparedQueryConfig, TPreparedQueryHKT extends ClickHousePreparedQueryHKT>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: ClickHouseQueryMetadata,
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<TPreparedQueryHKT, T> {
		return new ClickHouseDriverPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			customResultMapper,
			this.settings,
			this.cache,
			queryMetadata,
			cacheConfig,
		) as PreparedQueryKind<TPreparedQueryHKT, T>;
	}

	/**
	 * Streams rows into a table through the driver's own insert, which writes them to the request
	 * body rather than into the statement.
	 *
	 * The async iterable is handed over as-is, so the driver pulls rows as the socket drains and a
	 * source larger than memory never materialises. `@clickhouse/client` accepts one directly on Node;
	 * on the web build, which has no `Readable`, it is collected first — the streaming guarantee is
	 * the platform's, not Drizzle's.
	 */
	async insertRows(
		table: string,
		rows: AsyncIterable<Record<string, unknown>>,
		options: { settings?: ClickHouseSettings; metadata?: ClickHouseQueryMetadata } = {},
	): Promise<{ query_id: string }> {
		const settings = { ...this.settings, ...options.settings };
		this.logger.logQuery(`insert into ${table} format ${INSERT_FORMAT}`, []);

		try {
			const result = await this.client.insert({
				table,
				values: toInsertStream(rows),
				format: INSERT_FORMAT,
				clickhouse_settings: settings,
			});

			// Mirrors what a prepared mutation does through `queryWithCache`: a write invalidates the
			// tables it touched, and a NoopCache makes it free.
			if (options.metadata && !is(this.cache, NoopCache)) {
				await this.cache.onMutate({ tables: options.metadata.tables });
			}

			return { query_id: result.query_id };
		} catch (e) {
			// A row we refused to send is not a query failure — the statement never left. Wrapping it
			// would report a caller's typo as "ClickHouse rejected this".
			if (e instanceof ClickHouseInsertValueError) throw e;
			throw new DrizzleQueryError(`insert into ${table} format ${INSERT_FORMAT}`, [], e as Error);
		}
	}

	async all<T = unknown>(query: SQL): Promise<T[]> {
		const { sql: queryString, params } = this.dialect.sqlToQuery(query);
		this.logger.logQuery(queryString, params);

		const resultSet = await this.client.query({
			query: queryString,
			format: 'JSON',
			clickhouse_settings: this.settings,
		});
		const { data } = await resultSet.json<T>();
		return data;
	}
}

export interface ClickHouseDriverQueryResultHKT extends ClickHouseQueryResultHKT {
	type: ClickHouseQueryResult<Assume<this['row'], Record<string, unknown>>>;
}

export interface ClickHouseDriverPreparedQueryHKT extends ClickHousePreparedQueryHKT {
	type: ClickHouseDriverPreparedQuery<Assume<this['config'], ClickHousePreparedQueryConfig>>;
}
