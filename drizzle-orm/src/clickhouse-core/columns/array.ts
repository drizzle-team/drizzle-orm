import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder, type ClickHouseColumnBuilderBase } from './common.ts';
import type { ElementData } from './nullable.ts';

export type ClickHouseArrayBuilderInitial<TName extends string, TBase extends ClickHouseColumnBuilderBase> =
	ClickHouseArrayBuilder<
		{
			name: TName;
			dataType: 'array';
			columnType: 'ClickHouseArray';
			data: ElementData<TBase>[];
			driverParam: unknown[];
			enumValues: undefined;
			// `Array(T)` can never itself be `Nullable`, so the column is non-nullable by construction.
			notNull: true;
		},
		TBase
	>;

export class ClickHouseArrayBuilder<
	T extends ColumnBuilderBaseConfig<'array', 'ClickHouseArray'>,
	TBase extends ClickHouseColumnBuilderBase,
> extends ClickHouseColumnBuilder<T, { baseBuilder: TBase }> {
	static override readonly [entityKind]: string = 'ClickHouseArrayBuilder';

	constructor(name: T['name'], baseBuilder: TBase) {
		super(name, 'array', 'ClickHouseArray');
		this.config.baseBuilder = baseBuilder;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseArray<MakeColumnConfig<T, TTableName>> {
		const baseColumn = (this.config.baseBuilder as unknown as ClickHouseColumnBuilder)
			.markAsElement()
			.build(table);
		return new ClickHouseArray<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			baseColumn,
		);
	}
}

export class ClickHouseArray<T extends ColumnBaseConfig<'array', 'ClickHouseArray'>> extends ClickHouseColumn<T> {
	static override readonly [entityKind]: string = 'ClickHouseArray';

	constructor(
		table: AnyClickHouseTable<{ name: T['tableName'] }>,
		config: ColumnBuilderRuntimeConfig<any, any>,
		readonly baseColumn: ClickHouseColumn,
	) {
		super(table as any, config);
	}

	/** ClickHouse rejects `Nullable(Array(...))`; use an empty array instead of null. */
	override get supportsNullable(): boolean {
		return false;
	}

	getBaseSQLType(): string {
		return `Array(${this.baseColumn.getSQLType()})`;
	}

	override mapFromDriverValue(value: unknown[]): unknown[] {
		return value.map((element) => element === null ? null : this.baseColumn.mapFromDriverValue(element));
	}

	override mapToDriverValue(value: unknown[]): SQL {
		const elements = value.map((element) =>
			element === null ? sql`NULL` : sql`${this.baseColumn.mapToDriverValue(element)}`
		);
		return sql`[${sql.join(elements, sql`, `)}]`;
	}
}

/**
 * `Array(T)` — an ordered list. Elements are non-nullable unless wrapped in
 * {@link nullable}, and arrays nest, so `array(array(int32()))` is `Array(Array(Int32))`.
 *
 * ```ts
 * tags: array(string()),
 * scores: array(nullable(float64())),
 * ```
 */
export function array<TBase extends ClickHouseColumnBuilderBase>(
	baseBuilder: TBase,
): ClickHouseArrayBuilderInitial<'', TBase>;
export function array<TName extends string, TBase extends ClickHouseColumnBuilderBase>(
	name: TName,
	baseBuilder: TBase,
): ClickHouseArrayBuilderInitial<TName, TBase>;
export function array(a: string | ClickHouseColumnBuilderBase, b?: ClickHouseColumnBuilderBase) {
	return typeof a === 'string'
		? new ClickHouseArrayBuilder(a, b!)
		: new ClickHouseArrayBuilder('', a);
}
