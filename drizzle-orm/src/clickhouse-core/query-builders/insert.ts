import type { ClickHouseDialect } from '~/clickhouse-core/dialect.ts';
import type { ClickHouseSettings } from '~/clickhouse-core/engines.ts';
import type {
	AnyClickHouseQueryResultHKT,
	ClickHousePreparedQueryConfig,
	ClickHouseQueryResultHKT,
	ClickHouseQueryResultKind,
	ClickHouseSession,
	PreparedQueryHKTBase,
	PreparedQueryKind,
} from '~/clickhouse-core/session.ts';
import type { ClickHouseTable } from '~/clickhouse-core/table.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, Placeholder, SQL } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import { extractUsedTable } from '../utils.ts';

export interface ClickHouseInsertConfig<TTable extends ClickHouseTable = ClickHouseTable> {
	table: TTable;
	/** Literal rows, inlined into the statement. Mutually exclusive with {@link rows} and {@link select}. */
	values?: Record<string, Param | SQL>[];
	/**
	 * Rows sent as a body in a row format. Mutually exclusive with {@link values} and {@link select}.
	 *
	 * Async because the point of this path is that it streams: the source can be larger than memory
	 * and the driver pulls from it as the socket drains.
	 */
	rows?: AsyncIterable<Record<string, unknown>>;
	/** An `INSERT INTO … SELECT` source. Mutually exclusive with {@link values} and {@link rows}. */
	select?: SQL;
	settings?: ClickHouseSettings;
}

/** The row format a body insert uses. `JSONEachRow` matches columns by name, so rows may omit them. */
export const CLICKHOUSE_INSERT_FORMAT = 'JSONEachRow';


export type AnyClickHouseInsertConfig = ClickHouseInsertConfig<ClickHouseTable>;

export type ClickHouseInsertValue<TTable extends ClickHouseTable> =
	& {
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
	& {};

/**
 * Whether a `values()` argument is a stream rather than one row or an array of them.
 *
 * An array is iterable too, so it is excluded explicitly — it is the shape that can be scanned for
 * SQL expressions ahead of time, which is what decides the path.
 */
function isStreamedRows<TRow>(
	value: unknown,
): value is Iterable<TRow> | AsyncIterable<TRow> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	return Symbol.iterator in value || Symbol.asyncIterator in value;
}

/** @internal Presents an already-mapped array as the async iterable the config holds. */
async function* toAsyncIterable<T>(rows: T[]): AsyncIterable<T> {
	yield* rows;
}

export class ClickHouseInsertBuilder<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'ClickHouseInsertBuilder';

	constructor(
		private table: TTable,
		private session: ClickHouseSession,
		private dialect: ClickHouseDialect,
		/** Set by {@link inline}: keep the rows in the statement rather than sending a body. */
		private forceStatement = false,
	) {}

	/**
	 * Puts the rows in the statement, as `INSERT … VALUES (…), (…)`, rather than sending them as a
	 * body.
	 *
	 * The default is the body, because it streams and because the server parses a row format far more
	 * cheaply than a list of SQL expressions. This exists for when the statement itself is the
	 * artefact — something to log, hand to another tool, or run where no driver is available — and it
	 * necessarily materialises the batch.
	 *
	 * ```ts
	 * db.insert(events).inline().values(rows).toSQL().sql
	 * ```
	 */
	inline(): ClickHouseInsertBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new ClickHouseInsertBuilder(this.table, this.session, this.dialect, true);
	}

	/**
	 * The rows to insert.
	 *
	 * **Rows go as a `JSONEachRow` body, not inside the statement.** ClickHouse has no
	 * prepared-statement protocol, so the inline form has to render every value as a SQL literal —
	 * which means building the whole batch as one string here and re-parsing every field as an
	 * expression there. That is fine for three rows and wrong for three hundred thousand, and since
	 * the driver can stream a body, the body is the default.
	 *
	 * Two things send a batch down the inline path instead, both automatic: a value that is a SQL
	 * expression (`sql\`now()\``) or a placeholder, because a body has nowhere to put one. Call
	 * {@link ClickHouseInsertBase.inline} to force it.
	 *
	 * Passing an iterable or async iterable streams: the driver pulls rows as the socket drains and
	 * nothing materialises the batch. A stream cannot be scanned for SQL values ahead of time, so one
	 * that yields a row containing an expression throws when it reaches it.
	 */
	values(value: ClickHouseInsertValue<TTable>): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(values: ClickHouseInsertValue<TTable>[]): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(
		values:
			| Iterable<ClickHouseInsertValue<TTable>>
			| AsyncIterable<ClickHouseInsertValue<TTable>>,
	): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT>;
	values(
		values:
			| ClickHouseInsertValue<TTable>
			| ClickHouseInsertValue<TTable>[]
			| Iterable<ClickHouseInsertValue<TTable>>
			| AsyncIterable<ClickHouseInsertValue<TTable>>,
	): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT> {
		if (isStreamedRows<ClickHouseInsertValue<TTable>>(values)) {
			if (this.forceStatement) {
				throw new Error(
					'inline() needs the rows in memory. Pass an array to values() rather than a stream.',
				);
			}
			return new ClickHouseInsertBase(
				this.table,
				{ rows: this.toRowStream(values) },
				this.session,
				this.dialect,
			);
		}

		const list = Array.isArray(values) ? values : [values as ClickHouseInsertValue<TTable>];
		if (list.length === 0) {
			throw new Error('values() must be called with at least one value');
		}

		// A body cannot carry an expression, so a batch containing one takes the inline path. Checked
		// rather than rejected: `sql\`now()\`` in a handful of rows is an ordinary thing to write, and
		// silently working is better than a rule callers have to learn.
		const hasExpression = list.some((entry) =>
			Object.values(entry as Record<string, unknown>).some((value) =>
				is(value, SQL) || is(value, Placeholder)
			)
		);
		if (!hasExpression && !this.forceStatement) {
			// Mapped now rather than as the driver pulls: the rows are already in memory, so laziness
			// buys nothing, and a bad row throws from the `values()` call that built it instead of from
			// inside an insert three frames away.
			const mapped = list.map((entry) =>
				this.dialect.mapRowForInsert(this.table, entry as Record<string, unknown>)
			);
			return new ClickHouseInsertBase(
				this.table,
				{ rows: toAsyncIterable(mapped) },
				this.session,
				this.dialect,
			);
		}

		return new ClickHouseInsertBase(
			this.table,
			{ values: this.toStatementValues(list) },
			this.session,
			this.dialect,
		);
	}

	/** @internal Wraps rows so each is mapped to its row-format form as it is pulled. */
	private async *toRowStream(
		source: Iterable<ClickHouseInsertValue<TTable>> | AsyncIterable<ClickHouseInsertValue<TTable>>,
	): AsyncIterable<Record<string, unknown>> {
		for await (const entry of source) {
			yield this.dialect.mapRowForInsert(this.table, entry as Record<string, unknown>);
		}
	}

	/** @internal */
	private toStatementValues(list: ClickHouseInsertValue<TTable>[]): Record<string, Param | SQL>[] {
		const cols = this.table[Table.Symbol.Columns];
		return list.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
			}
			return result;
		});
	}

	/**
	 * Populates the table from a query rather than from literal rows, emitting
	 * `INSERT INTO … SELECT …`.
	 *
	 * ClickHouse matches the selected columns to the table's columns *by position*, not by name, so
	 * the projection has to line up with the table's column order.
	 *
	 * @example
	 * ```ts
	 * await db.insert(dailyStats).select(
	 * 	db.select({ day: sql`toDate(${events.ts})`, hits: count() }).from(events).groupBy(sql`1`),
	 * );
	 * ```
	 */
	select(
		query: SQL | TypedQueryBuilder<any, any>,
	): ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT> {
		const selectSQL = is(query, SQL) ? query : query.getSQL();
		return new ClickHouseInsertBase(this.table, { select: selectSQL }, this.session, this.dialect);
	}
}

export type ClickHouseInsertWithout<
	T extends AnyClickHouseInsert,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		ClickHouseInsertBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type ClickHouseInsertDynamic<T extends AnyClickHouseInsert> = ClickHouseInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

export type ClickHouseInsertPrepare<T extends AnyClickHouseInsert> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	ClickHousePreparedQueryConfig & {
		execute: ClickHouseQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

export type ClickHouseInsert<
	TTable extends ClickHouseTable = ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT = AnyClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = ClickHouseInsertBase<TTable, TQueryResult, TPreparedQueryHKT, true, never>;

export type AnyClickHouseInsert = ClickHouseInsertBase<any, any, any, any, any>;

export interface ClickHouseInsertBase<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<ClickHouseQueryResultKind<TQueryResult, never>>,
	RunnableQuery<ClickHouseQueryResultKind<TQueryResult, never>, 'clickhouse'>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'clickhouse';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: ClickHouseQueryResultKind<TQueryResult, never>;
	};
}

/**
 * An insert into a ClickHouse table.
 *
 * There is no `ON CONFLICT`/`ON DUPLICATE KEY` equivalent and no `RETURNING`: ClickHouse does not
 * enforce primary-key uniqueness at write time, and inserts do not report generated values back.
 * Deduplication is a property of the engine — see `ReplacingMergeTree` — not of the insert.
 */
export class ClickHouseInsertBase<
	TTable extends ClickHouseTable,
	TQueryResult extends ClickHouseQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<ClickHouseQueryResultKind<TQueryResult, never>>
	implements RunnableQuery<ClickHouseQueryResultKind<TQueryResult, never>, 'clickhouse'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'ClickHouseInsert';

	declare protected $table: TTable;

	private config: ClickHouseInsertConfig<TTable>;

	constructor(
		table: TTable,
		source: Pick<ClickHouseInsertConfig<TTable>, 'values' | 'rows' | 'select'>,
		private session: ClickHouseSession,
		private dialect: ClickHouseDialect,
	) {
		super();
		this.config = { table, ...source };
	}

	/**
	 * Adds a query-level `SETTINGS` clause.
	 *
	 * @example
	 * ```ts
	 * await db.insert(events).values(rows).settings({ async_insert: 1, wait_for_async_insert: 0 });
	 * ```
	 */
	settings(settings: ClickHouseSettings): ClickHouseInsertWithout<this, TDynamic, 'settings'> {
		this.config.settings = { ...this.config.settings, ...settings };
		return this as any;
	}

	/** Whether this insert sends its rows as a body rather than inside the statement. */
	private get isRowFormat(): boolean {
		return this.config.rows !== undefined;
	}

	/** @internal */
	getSQL(): SQL {
		return this.isRowFormat
			? this.dialect.buildInsertRowsQuery(this.config.table, CLICKHOUSE_INSERT_FORMAT)
			: this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): ClickHouseInsertPrepare<this> {
		if (this.isRowFormat) {
			throw new Error(
				'A row-format insert has no statement to prepare — its rows travel as a body. Await it '
					+ 'directly, or call inline() to build an INSERT … VALUES statement instead.',
			);
		}
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
			undefined,
			{
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			},
		) as ClickHouseInsertPrepare<this>;
	}

	override execute: ReturnType<this['prepare']>['execute'] = async (placeholderValues) => {
		if (this.config.rows !== undefined) {
			const result = await this.session.insertRows(
				this.dialect.insertTargetName(this.config.table),
				this.config.rows,
				{
					settings: this.config.settings,
					metadata: { type: 'insert', tables: extractUsedTable(this.config.table) },
				},
			);
			return { rows: [], ...result } as any;
		}
		return this.prepare().execute(placeholderValues);
	};

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();

	$dynamic(): ClickHouseInsertDynamic<this> {
		return this as any;
	}
}
