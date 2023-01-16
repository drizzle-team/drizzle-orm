import { ColumnBuilder, ColumnBuilderBaseConfig, ColumnBuilderConfig } from './column-builder';
import { DriverValueMapper, SQL } from './sql';
import { Table } from './table';
import { Update } from './utils';

export interface ColumnBaseConfig extends ColumnBuilderBaseConfig {
	tableName: string;
}

export type ColumnConfig<TPartial extends Partial<ColumnBaseConfig> = {}> = Update<
	ColumnBuilderConfig & { tableName: string },
	TPartial
>;

// export type UpdateColumnConfig<
// 	T extends ColumnBaseConfig,
// 	TUpdate extends Partial<ColumnBaseConfig>,
// > = Update<T, TUpdate, keyof ColumnBaseConfig>;

/*
	`Column` only accepts a full `ColumnConfig` as its generic.
	To infer parts of the config, use `AnyColumn` that accepts a partial config.
	See `GetColumnData` for example usage of inferring.
*/
export abstract class Column<T extends Partial<ColumnBaseConfig>>
	implements DriverValueMapper<T['data'], T['driverParam']>
{
	declare protected $brand: 'Column';
	declare protected $config: T;
	declare protected $data: T['data'];
	declare protected $driverParam: T['driverParam'];
	declare protected $notNull: T['notNull'];
	declare protected $hasDefault: T['hasDefault'];

	readonly name: string;
	readonly primary: boolean;
	readonly notNull: boolean;
	readonly default: T['data'] | SQL | undefined;
	readonly hasDefault: boolean;

	constructor(readonly table: Table<T['tableName']>, config: ColumnBuilder<Omit<T, 'tableName'>>['config']) {
		this.name = config.name;
		this.notNull = config.notNull;
		this.default = config.default;
		this.hasDefault = config.hasDefault;
		this.primary = config.primaryKey;
	}

	abstract getSQLType(): string;

	mapFromDriverValue(value: T['driverParam']): T['data'] {
		return value as any;
	}

	mapToDriverValue(value: T['data']): T['driverParam'] {
		return value as any;
	}
}

export type UpdateColConfig<T extends Partial<ColumnBaseConfig>, TUpdate extends Partial<ColumnBaseConfig>> = Update<
	T,
	TUpdate
>;

export type AnyColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = Column<Update<ColumnBaseConfig, TPartial>>;

export type GetColumnData<TColumn extends AnyColumn, TInferMode extends 'query' | 'raw' = 'query'> =
	// dprint-ignore
	TColumn extends AnyColumn<{ data: infer TData; notNull: infer TNotNull extends boolean }>
		? TInferMode extends 'raw' // Raw mode
			? TData // Just return the underlying type
			: TNotNull extends true // Query mode
			? TData // Query mode, not null
			: TData | null // Query mode, nullable
		: never;

/**
	`GetColumnConfig` can be used to infer either the full config of the column or a single parameter.
	@example
	type TConfig = GetColumnConfig<typeof column>;
	type TNotNull = GetColumnConfig<typeof column, 'notNull'>;
*/
export type GetColumnConfig<TColumn extends AnyColumn, TParam extends keyof ColumnBaseConfig | undefined = undefined> =
	TColumn extends Column<infer TConfig> ? TParam extends keyof ColumnBaseConfig ? TConfig[TParam] : TConfig : never;

export type InferColumnsDataTypes<TColumns extends Record<string, AnyColumn>> = {
	[Key in keyof TColumns]: GetColumnData<TColumns[Key], 'query'>;
};
