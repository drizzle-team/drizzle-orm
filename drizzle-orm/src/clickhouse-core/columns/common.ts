import type { AnyClickHouseTable, ClickHouseTable } from '~/clickhouse-core/table.ts';
import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	GeneratedColumnConfig,
	GeneratedStorageMode,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Update } from '~/utils.ts';

export interface ClickHouseColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'clickhouse' }> {}

/**
 * How a computed ClickHouse column is stored, spelled in Drizzle's vocabulary.
 *
 * - `stored` — ClickHouse's `MATERIALIZED`: evaluated on insert and written to disk.
 * - `virtual` — ClickHouse's `ALIAS`: not stored, evaluated on every read.
 */
export type ClickHouseComputedColumnMode = GeneratedStorageMode;

/** The ClickHouse keyword corresponding to each {@link ClickHouseComputedColumnMode}. */
export const COMPUTED_COLUMN_KEYWORD = {
	stored: 'MATERIALIZED',
	virtual: 'ALIAS',
} as const satisfies Record<ClickHouseComputedColumnMode, string>;

export interface ClickHouseColumnConfig {
	codec: (string | SQL)[] | undefined;
	ttl: SQL | undefined;
	comment: string | undefined;
	/** Set for `EPHEMERAL` columns, which are accepted on insert but never stored. */
	ephemeral: boolean;
	/**
	 * Set by {@link nullable}. Distinguishes "the user asked for `Nullable(T)`" from "the user never
	 * said", which matters for `Array`/`Map`/`Tuple` elements — those default to non-nullable to match
	 * ClickHouse, rather than to Drizzle's nullable-unless-`notNull` default for table columns.
	 */
	explicitNullable: boolean;
}

export abstract class ClickHouseColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<
	T,
	TRuntimeConfig & ClickHouseColumnConfig,
	TTypeConfig & { dialect: 'clickhouse' },
	TExtraConfig
> implements ClickHouseColumnBuilderBase<T, TTypeConfig> {
	static override readonly [entityKind]: string = 'ClickHouseColumnBuilder';

	constructor(name: T['name'], dataType: T['dataType'], columnType: T['columnType']) {
		super(name, dataType, columnType);
		this.config.codec = undefined;
		this.config.ttl = undefined;
		this.config.comment = undefined;
		this.config.ephemeral = false;
		this.config.explicitNullable = false;
	}

	/**
	 * @internal The builder's `dataType`.
	 *
	 * `builder['_']` is a type-only declaration and is `undefined` at runtime, so wrapper types such as
	 * `LowCardinality(T)` have to read it off the runtime config instead.
	 */
	getDataType(): ColumnDataType {
		return this.config.dataType as ColumnDataType;
	}

	/** @internal The `enumValues` a wrapper type should inherit from the type it wraps. */
	getEnumValues(): string[] | undefined {
		return (this.config as { enumValues?: string[] }).enumValues;
	}

	/** @internal Marks the builder as explicitly `Nullable(T)`. See {@link nullable}. */
	markNullable(): this {
		this.config.notNull = false;
		this.config.explicitNullable = true;
		return this;
	}

	/**
	 * @internal Prepares the builder for use as an `Array`/`Map`/`Tuple` element.
	 *
	 * Element types are non-nullable unless wrapped in {@link nullable}, which is the opposite of the
	 * default for table columns but matches how ClickHouse types are normally written.
	 */
	markAsElement(): this {
		if (!this.config.explicitNullable) {
			this.config.notNull = true;
		}
		return this;
	}

	/**
	 * Attaches a compression `CODEC` to the column.
	 *
	 * @example
	 * ```ts
	 * const events = clickhouseTable('events', {
	 * 	body: string().codec('ZSTD(3)'),
	 * 	ts: dateTime().codec('Delta', 'LZ4'),
	 * });
	 * ```
	 */
	codec(...codecs: [string | SQL, ...(string | SQL)[]]): this {
		this.config.codec = codecs;
		return this;
	}

	/**
	 * Adds a column-level `TTL` expression. Rows are not dropped; the column value is reset to its
	 * default once the expression elapses.
	 *
	 * @example
	 * ```ts
	 * const events = clickhouseTable('events', {
	 * 	createdAt: dateTime().notNull(),
	 * 	payload: string().ttl(sql`createdAt + INTERVAL 1 MONTH`),
	 * });
	 * ```
	 */
	ttl(expression: SQL): this {
		this.config.ttl = expression;
		return this;
	}

	/** Adds a `COMMENT` to the column definition. */
	comment(value: string): this {
		this.config.comment = value;
		return this;
	}

	/**
	 * Marks the column as `EPHEMERAL`. Ephemeral columns are accepted on insert and can be referenced
	 * by other columns' `DEFAULT`/`MATERIALIZED` expressions, but are never stored.
	 */
	ephemeral(): this {
		this.config.ephemeral = true;
		return this;
	}

	/**
	 * Declares the column as `MATERIALIZED`: the expression is evaluated on insert and stored on disk.
	 * Materialized columns cannot be written to directly, so they are omitted from the insert model.
	 */
	materialized(expression: SQL | (() => SQL)): HasGenerated<this, { type: 'always' }> {
		return this.generatedAlwaysAs(expression, { mode: 'stored' });
	}

	/**
	 * Declares the column as an `ALIAS`: the expression is not stored and is evaluated on read.
	 * Alias columns cannot be written to directly, so they are omitted from the insert model.
	 */
	aliasedAs(expression: SQL | (() => SQL)): HasGenerated<this, { type: 'always' }> {
		return this.generatedAlwaysAs(expression, { mode: 'virtual' });
	}

	generatedAlwaysAs(
		as: SQL | T['data'] | (() => SQL),
		config?: Partial<GeneratedColumnConfig<unknown>>,
	): HasGenerated<this, { type: 'always' }> {
		this.config.generated = {
			as,
			type: 'always',
			mode: config?.mode ?? 'stored',
		};
		return this as any;
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `ClickHouseColumn` and `AnyClickHouseColumn`, see `Column` and `AnyColumn` documentation.
export abstract class ClickHouseColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig & ClickHouseColumnConfig, TTypeConfig & { dialect: 'clickhouse' }> {
	static override readonly [entityKind]: string = 'ClickHouseColumn';

	constructor(
		override readonly table: ClickHouseTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig & ClickHouseColumnConfig>,
	) {
		super(table, config);
	}

	/**
	 * The ClickHouse type of this column without the `Nullable(...)` wrapper — for example `Int32`,
	 * `DateTime64(3, 'UTC')` or `Array(String)`.
	 */
	abstract getBaseSQLType(): string;

	/**
	 * ClickHouse forbids `Nullable(T)` when `T` is `Array`, `Map`, `Tuple`, `JSON` or itself `Nullable`.
	 * Columns of those types are always emitted bare, even when the Drizzle model marks them nullable.
	 */
	get supportsNullable(): boolean {
		return true;
	}

	getSQLType(): string {
		const baseType = this.getBaseSQLType();
		return this.notNull || !this.supportsNullable ? baseType : `Nullable(${baseType})`;
	}

	/** The compression codecs attached with `.codec()`, if any. */
	get codec(): (string | SQL)[] | undefined {
		return this.config.codec;
	}

	/** The column-level `TTL` expression attached with `.ttl()`, if any. */
	get ttl(): SQL | undefined {
		return this.config.ttl;
	}

	/** The `COMMENT` attached with `.comment()`, if any. */
	get comment(): string | undefined {
		return this.config.comment;
	}

	/** Whether the column was declared `EPHEMERAL`. */
	get isEphemeral(): boolean {
		return this.config.ephemeral;
	}

	/** The ClickHouse keyword for a computed column — `MATERIALIZED` or `ALIAS` — if it is one. */
	get computedKeyword(): 'MATERIALIZED' | 'ALIAS' | undefined {
		const mode = this.config.generated?.mode;
		return mode === undefined ? undefined : COMPUTED_COLUMN_KEYWORD[mode];
	}

	/**
	 * The value as a *row format* carries it — the JSON a `JSONEachRow` body holds — as opposed to
	 * {@link mapToDriverValue}, which renders a SQL literal for a statement.
	 *
	 * ClickHouse takes data by two routes and they are not the same encoding. A statement needs
	 * `toDateTime64('2026-08-11 12:00:00.000', 3, 'UTC')`, because a bare string compared against a
	 * `DateTime64` column is a hard error; a JSON body needs the bare `"2026-08-11 12:00:00.000"` and
	 * lets the column's own type do the parsing, because there is no expression to type-check. The
	 * two paths exist because inlining a bulk load into one statement makes the client build the
	 * whole batch as a string and the server re-parse every field as a SQL expression.
	 *
	 * **Overriding one without the other is the bug this pair invites** — a column that filters
	 * correctly and inserts wrong, or vice versa. The default returns the value untouched, which is
	 * already correct for every type whose JavaScript form is its JSON form (`String`, `Int32`,
	 * `Float64`, `Bool`, `UUID`, `IPv4`, `JSON`); the types that need more override it next to their
	 * `mapToDriverValue`, and `clickhouse-core/columns/__tests__` asserts the pair round-trips for
	 * each of them.
	 */
	mapToRowValue(value: unknown): unknown {
		return value;
	}
}

export type AnyClickHouseColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> =
	ClickHouseColumn<
		Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
	>;
