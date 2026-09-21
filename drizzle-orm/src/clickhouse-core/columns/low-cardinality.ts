import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder, type ClickHouseColumnBuilderBase } from './common.ts';

export type ClickHouseLowCardinalityBuilderInitial<TName extends string, TBase extends ClickHouseColumnBuilderBase> =
	ClickHouseLowCardinalityBuilder<
		{
			name: TName;
			dataType: TBase['_']['dataType'];
			columnType: 'ClickHouseLowCardinality';
			data: TBase['_'] extends { $type: infer U } ? U : TBase['_']['data'];
			driverParam: TBase['_']['driverParam'];
			enumValues: TBase['_']['enumValues'];
		},
		TBase
	>;

export class ClickHouseLowCardinalityBuilder<
	T extends ColumnBuilderBaseConfig<any, 'ClickHouseLowCardinality'>,
	TBase extends ClickHouseColumnBuilderBase,
> extends ClickHouseColumnBuilder<T, { baseBuilder: TBase; enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'ClickHouseLowCardinalityBuilder';

	constructor(name: T['name'], baseBuilder: TBase) {
		super(name, (baseBuilder as unknown as ClickHouseColumnBuilder).getDataType(), 'ClickHouseLowCardinality');
		this.config.baseBuilder = baseBuilder;
		this.config.enumValues = (baseBuilder as unknown as ClickHouseColumnBuilder).getEnumValues() as T['enumValues'];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseLowCardinality<MakeColumnConfig<T, TTableName>> {
		const baseColumn = (this.config.baseBuilder as unknown as ClickHouseColumnBuilder)
			.markAsElement()
			.build(table);
		return new ClickHouseLowCardinality<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			baseColumn,
		);
	}
}

export class ClickHouseLowCardinality<T extends ColumnBaseConfig<any, 'ClickHouseLowCardinality'>>
	extends ClickHouseColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'ClickHouseLowCardinality';

	constructor(
		table: AnyClickHouseTable<{ name: T['tableName'] }>,
		config: ColumnBuilderRuntimeConfig<any, any>,
		readonly baseColumn: ClickHouseColumn,
	) {
		super(table as any, config);
	}

	override readonly enumValues = this.config.enumValues;

	getBaseSQLType(): string {
		return this.baseColumn.getSQLType();
	}

	/**
	 * `Nullable` nests *inside* `LowCardinality`, not around it, so the generic
	 * `Nullable(<base>)` wrapping in {@link ClickHouseColumn.getSQLType} would produce an invalid type.
	 */
	override getSQLType(): string {
		const inner = this.baseColumn.getSQLType();
		const innerType = this.notNull || inner.startsWith('Nullable(') ? inner : `Nullable(${inner})`;
		return `LowCardinality(${innerType})`;
	}

	override mapFromDriverValue(value: unknown): unknown {
		return this.baseColumn.mapFromDriverValue(value);
	}

	override mapToDriverValue(value: unknown): unknown {
		return this.baseColumn.mapToDriverValue(value);
	}

	override mapToRowValue(value: unknown): unknown {
		return this.baseColumn.mapToRowValue(value);
	}
}

/**
 * `LowCardinality(T)` — dictionary-encodes a column whose values repeat heavily. ClickHouse
 * recommends it below roughly 10 000 distinct values.
 *
 * ```ts
 * country: lowCardinality(string()).notNull(),  // LowCardinality(String)
 * region: lowCardinality(string()),             // LowCardinality(Nullable(String))
 * ```
 */
export function lowCardinality<TBase extends ClickHouseColumnBuilderBase>(
	baseBuilder: TBase,
): ClickHouseLowCardinalityBuilderInitial<'', TBase>;
export function lowCardinality<TName extends string, TBase extends ClickHouseColumnBuilderBase>(
	name: TName,
	baseBuilder: TBase,
): ClickHouseLowCardinalityBuilderInitial<TName, TBase>;
export function lowCardinality(a: string | ClickHouseColumnBuilderBase, b?: ClickHouseColumnBuilderBase) {
	return typeof a === 'string'
		? new ClickHouseLowCardinalityBuilder(a, b!)
		: new ClickHouseLowCardinalityBuilder('', a);
}
