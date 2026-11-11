import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
import type { Equal } from '~/utils.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

export type ConvertCustomConfig<TName extends string, T extends Partial<CustomTypeValues>> =
	& {
		name: TName;
		dataType: 'custom';
		columnType: 'ClickHouseCustomColumn';
		data: T['data'];
		driverParam: T['driverData'];
		enumValues: undefined;
	}
	& (T['notNull'] extends true ? { notNull: true } : {})
	& (T['default'] extends true ? { hasDefault: true } : {});

export interface ClickHouseCustomColumnInnerConfig {
	customTypeParams: CustomTypeParams<any>;
}

export class ClickHouseCustomColumnBuilder<T extends ColumnBuilderBaseConfig<'custom', 'ClickHouseCustomColumn'>>
	extends ClickHouseColumnBuilder<
		T,
		{
			fieldConfig: CustomTypeValues['config'];
			customTypeParams: CustomTypeParams<any>;
		},
		{
			clickhouseColumnBuilderBrand: 'ClickHouseCustomColumnBuilderBrand';
		}
	>
{
	static override readonly [entityKind]: string = 'ClickHouseCustomColumnBuilder';

	constructor(
		name: T['name'],
		fieldConfig: CustomTypeValues['config'],
		customTypeParams: CustomTypeParams<any>,
	) {
		super(name, 'custom', 'ClickHouseCustomColumn');
		this.config.fieldConfig = fieldConfig;
		this.config.customTypeParams = customTypeParams;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseCustomColumn<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseCustomColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseCustomColumn<T extends ColumnBaseConfig<'custom', 'ClickHouseCustomColumn'>>
	extends ClickHouseColumn<T>
{
	static override readonly [entityKind]: string = 'ClickHouseCustomColumn';

	private sqlName: string;
	private mapTo?: (value: T['data']) => T['driverParam'] | SQL;
	private mapRow?: (value: T['data']) => unknown;
	private mapFrom?: (value: T['driverParam']) => T['data'];

	constructor(
		table: AnyClickHouseTable<{ name: T['tableName'] }>,
		config: ClickHouseCustomColumnBuilder<T>['config'],
	) {
		super(table as any, config);
		this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
		this.mapTo = config.customTypeParams.toDriver;
		this.mapRow = config.customTypeParams.toRow;
		this.mapFrom = config.customTypeParams.fromDriver;
	}

	getBaseSQLType(): string {
		return this.sqlName;
	}

	override mapFromDriverValue(value: T['driverParam']): T['data'] {
		return typeof this.mapFrom === 'function' ? this.mapFrom(value) : (value as T['data']);
	}

	override mapToDriverValue(value: T['data']): T['driverParam'] | SQL {
		return typeof this.mapTo === 'function' ? this.mapTo(value) : (value as T['driverParam']);
	}

	/**
	 * `toRow` when the type declares one, otherwise `toDriver` — unless `toDriver` returned SQL, which
	 * a row format has nowhere to put, in which case the value passes through untouched.
	 *
	 * A custom type whose `toDriver` builds an expression (`toIPv6('…')`, `map(…)`) and whose data is
	 * not already its own JSON form needs `toRow`; without it the fallback would send the raw value
	 * and let the server's column type decide, which is right often enough to be worth doing and
	 * wrong quietly enough to be worth saying out loud.
	 */
	override mapToRowValue(value: T['data']): unknown {
		if (typeof this.mapRow === 'function') return this.mapRow(value);
		if (typeof this.mapTo !== 'function') return value;
		const mapped = this.mapTo(value);
		return is(mapped, SQL) ? value : mapped;
	}
}

export type CustomTypeValues = {
	/** The TypeScript type this column reads and writes. */
	data: unknown;
	/**
	 * The value handed to and received from the driver.
	 *
	 * Returning a {@link SQL} from `toDriver` is the way to emit a ClickHouse function call such as
	 * `toIPv6('…')` rather than a bare literal.
	 */
	driverData?: unknown;
	/** Extra options accepted by the type, surfaced to `dataType()`. */
	config?: Record<string, any>;
	/** Set to `true` to make `config` required. */
	configRequired?: boolean;
	/** Set to `true` to have the type imply `.notNull()`. */
	notNull?: boolean;
	/** Set to `true` to have the type imply a default. */
	default?: boolean;
};

export interface CustomTypeParams<T extends CustomTypeValues> {
	/**
	 * Returns the ClickHouse type as it should appear in DDL, e.g. `Point` or
	 * `AggregateFunction(sum, UInt64)`.
	 */
	dataType: (config: T['config'] | (Equal<T['configRequired'], true> extends true ? never : undefined)) => string;

	/** Maps a TypeScript value to the SQL literal a statement should carry. */
	toDriver?: (value: T['data']) => T['driverData'] | SQL;

	/**
	 * Maps a TypeScript value to what a row format (`JSONEachRow`) should carry.
	 *
	 * Needed when {@link toDriver} builds an expression rather than returning a plain value — a body
	 * has nowhere to put `toIPv6('…')`. Without it the value is sent untouched and the column's own
	 * type does the parsing, which is right for most custom types and quietly wrong for the rest.
	 */
	toRow?: (value: T['data']) => unknown;

	/** Maps what ClickHouse returns back to a TypeScript value. */
	fromDriver?: (value: T['driverData']) => T['data'];
}

/**
 * Defines a column type Drizzle does not ship out of the box.
 *
 * ```ts
 * const point = customType<{ data: [number, number]; driverData: string }>({
 * 	dataType: () => 'Point',
 * 	toDriver: ([x, y]) => sql`(${x}, ${y})`,
 * 	fromDriver: (value) => JSON.parse(value),
 * });
 * ```
 */
export function customType<T extends CustomTypeValues = CustomTypeValues>(
	customTypeParams: CustomTypeParams<T>,
): Equal<T['configRequired'], true> extends true ? {
		<TConfig extends Record<string, any> & T['config']>(
			fieldConfig: TConfig,
		): ClickHouseCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TName extends string>(
			dbName: TName,
			fieldConfig: T['config'],
		): ClickHouseCustomColumnBuilder<ConvertCustomConfig<TName, T>>;
	}
	: {
		(): ClickHouseCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TConfig extends Record<string, any> & T['config']>(
			fieldConfig?: TConfig,
		): ClickHouseCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TName extends string>(
			dbName: TName,
			fieldConfig?: T['config'],
		): ClickHouseCustomColumnBuilder<ConvertCustomConfig<TName, T>>;
	}
{
	return ((a?: string | T['config'], b?: T['config']) => {
		const { name, config } = getColumnNameAndConfig<T['config']>(a, b);
		return new ClickHouseCustomColumnBuilder(name, config, customTypeParams);
	}) as any;
}
