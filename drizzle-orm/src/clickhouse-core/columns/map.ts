import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder, type ClickHouseColumnBuilderBase } from './common.ts';
import type { ElementData } from './nullable.ts';

/** Keys of a ClickHouse `Map` are always scalars, and arrive as JSON object keys. */
export type ClickHouseMapKey<TKey extends ClickHouseColumnBuilderBase> = ElementData<TKey> extends infer TData
	? TData extends string | number ? TData : string
	: never;

export type ClickHouseMapBuilderInitial<
	TName extends string,
	TKey extends ClickHouseColumnBuilderBase,
	TValue extends ClickHouseColumnBuilderBase,
> = ClickHouseMapBuilder<
	{
		name: TName;
		dataType: 'json';
		columnType: 'ClickHouseMap';
		data: Record<ClickHouseMapKey<TKey>, ElementData<TValue>>;
		driverParam: Record<string, unknown>;
		enumValues: undefined;
		// `Map(K, V)` can never itself be `Nullable`.
		notNull: true;
	},
	TKey,
	TValue
>;

export class ClickHouseMapBuilder<
	T extends ColumnBuilderBaseConfig<'json', 'ClickHouseMap'>,
	TKey extends ClickHouseColumnBuilderBase,
	TValue extends ClickHouseColumnBuilderBase,
> extends ClickHouseColumnBuilder<T, { keyBuilder: TKey; valueBuilder: TValue }> {
	static override readonly [entityKind]: string = 'ClickHouseMapBuilder';

	constructor(name: T['name'], keyBuilder: TKey, valueBuilder: TValue) {
		super(name, 'json', 'ClickHouseMap');
		this.config.keyBuilder = keyBuilder;
		this.config.valueBuilder = valueBuilder;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseMap<MakeColumnConfig<T, TTableName>> {
		const keyColumn = (this.config.keyBuilder as unknown as ClickHouseColumnBuilder).markAsElement().build(table);
		const valueColumn = (this.config.valueBuilder as unknown as ClickHouseColumnBuilder).markAsElement().build(table);
		return new ClickHouseMap<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			keyColumn,
			valueColumn,
		);
	}
}

export class ClickHouseMap<T extends ColumnBaseConfig<'json', 'ClickHouseMap'>> extends ClickHouseColumn<T> {
	static override readonly [entityKind]: string = 'ClickHouseMap';

	constructor(
		table: AnyClickHouseTable<{ name: T['tableName'] }>,
		config: ColumnBuilderRuntimeConfig<any, any>,
		readonly keyColumn: ClickHouseColumn,
		readonly valueColumn: ClickHouseColumn,
	) {
		super(table as any, config);
	}

	/** ClickHouse rejects `Nullable(Map(...))`; use an empty map instead of null. */
	override get supportsNullable(): boolean {
		return false;
	}

	getBaseSQLType(): string {
		return `Map(${this.keyColumn.getSQLType()}, ${this.valueColumn.getSQLType()})`;
	}

	override mapFromDriverValue(value: Record<string, unknown> | [unknown, unknown][]): Record<string, unknown> {
		const entries = Array.isArray(value) ? value : Object.entries(value);
		const result: Record<string, unknown> = {};
		for (const [key, entryValue] of entries) {
			// JSON object keys are always strings, so numeric-keyed maps come back as `"1"` and are
			// handed to the key column's own mapper to be turned back into a number.
			result[this.keyColumn.mapFromDriverValue(key) as string] = entryValue === null
				? null
				: this.valueColumn.mapFromDriverValue(entryValue);
		}
		return result;
	}

	/**
	 * A plain object. ClickHouse's JSON formats represent a `Map(K, V)` as one, and JSON object keys
	 * are always strings — so a numeric-keyed map's keys go through the key column's own mapping and
	 * are then stringified, which is exactly what {@link mapFromDriverValue} undoes.
	 */
	override mapToRowValue(value: Record<string, unknown> | Map<unknown, unknown>): Record<string, unknown> {
		const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
		const result: Record<string, unknown> = {};
		for (const [key, entryValue] of entries) {
			result[String(this.keyColumn.mapToRowValue(key))] = entryValue === null
				? null
				: this.valueColumn.mapToRowValue(entryValue);
		}
		return result;
	}

	override mapToDriverValue(value: Record<string, unknown> | Map<unknown, unknown>): SQL {
		const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
		if (entries.length === 0) {
			// `map()` with no arguments is ambiguous, so spell the empty map out as a cast.
			return sql`CAST([], ${sql.raw(`'${this.getBaseSQLType()}'`)})`;
		}
		const args = entries.flatMap(([key, entryValue]) => [
			sql`${this.keyColumn.mapToDriverValue(key)}`,
			entryValue === null ? sql`NULL` : sql`${this.valueColumn.mapToDriverValue(entryValue)}`,
		]);
		return sql`map(${sql.join(args, sql`, `)})`;
	}
}

/**
 * `Map(K, V)` — an associative array. Keys and values are non-nullable unless wrapped in
 * {@link nullable}.
 *
 * ```ts
 * labels: map(string(), string()),
 * counters: map(lowCardinality(string()), uint64()),
 * ```
 */
export function map<TKey extends ClickHouseColumnBuilderBase, TValue extends ClickHouseColumnBuilderBase>(
	keyBuilder: TKey,
	valueBuilder: TValue,
): ClickHouseMapBuilderInitial<'', TKey, TValue>;
export function map<
	TName extends string,
	TKey extends ClickHouseColumnBuilderBase,
	TValue extends ClickHouseColumnBuilderBase,
>(
	name: TName,
	keyBuilder: TKey,
	valueBuilder: TValue,
): ClickHouseMapBuilderInitial<TName, TKey, TValue>;
export function map(
	a: string | ClickHouseColumnBuilderBase,
	b: ClickHouseColumnBuilderBase,
	c?: ClickHouseColumnBuilderBase,
) {
	return typeof a === 'string'
		? new ClickHouseMapBuilder(a, b, c!)
		: new ClickHouseMapBuilder('', a, b);
}
