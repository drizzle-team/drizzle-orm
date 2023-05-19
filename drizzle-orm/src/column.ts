import type { ColumnBuilderBaseConfig, ColumnBuilderConfig, ColumnBuilderRuntimeConfig } from './column-builder';
import type { DriverValueMapper, SQL } from './sql';
import type { Table } from './table';
import type { Assume, Update } from './utils';

export interface ColumnBaseConfig extends ColumnBuilderBaseConfig {
	tableName: string;
}

export type ColumnConfig<TPartial extends Partial<ColumnBaseConfig> = {}> = Update<
	ColumnBuilderConfig & { tableName: string },
	TPartial
>;

export interface ColumnHKTBase {
	config: unknown;
	_type: unknown;
}

export type ColumnKind<T extends ColumnHKTBase, TConfig extends ColumnBaseConfig> = (T & {
	config: TConfig;
})['_type'];

export interface ColumnHKT extends ColumnHKTBase {
	_type: Column<ColumnHKT, Assume<this['config'], ColumnBaseConfig>>;
}

/*
	`Column` only accepts a full `ColumnConfig` as its generic.
	To infer parts of the config, use `AnyColumn` that accepts a partial config.
	See `GetColumnData` for example usage of inferring.
*/
export abstract class Column<
	THKT extends ColumnHKTBase,
	T extends ColumnBaseConfig,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> implements DriverValueMapper<T['data'], T['driverParam']> {
	declare _: {
		hkt: THKT;
		brand: 'Column';
		config: T;
		tableName: T['tableName'];
		name: T['name'];
		data: T['data'];
		driverParam: T['driverParam'];
		notNull: T['notNull'];
		hasDefault: T['hasDefault'];
	} & TTypeConfig;

	readonly name: string;
	readonly primary: boolean;
	readonly notNull: boolean;
	readonly default: T['data'] | SQL | undefined;
	readonly hasDefault: boolean;

	protected config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

	constructor(
		readonly table: Table,
		config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		this.config = config;
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

export type UpdateColConfig<T extends ColumnBaseConfig, TUpdate extends Partial<ColumnBaseConfig>> = Update<
	T,
	TUpdate
>;

export type AnyColumn<TPartial extends Partial<ColumnBaseConfig> = {}> = Column<
	ColumnHKT,
	Required<Update<ColumnBaseConfig, TPartial>>
>;

export interface AnyColumnHKT {
	config: unknown;
	type: unknown;
}

export interface AnyColumnHKTBase extends AnyColumnHKT {
	type: AnyColumn<Assume<this['config'], Partial<ColumnBaseConfig>>>;
}

export type AnyColumnKind<THKT extends AnyColumnHKT, TConfig extends Partial<ColumnBaseConfig>> =
	(THKT & { config: TConfig })['type'];

export type GetColumnData<TColumn extends AnyColumn, TInferMode extends 'query' | 'raw' = 'query'> =
	// dprint-ignore
	TInferMode extends 'raw' // Raw mode
		? TColumn['_']['data'] // Just return the underlying type
		: TColumn['_']['notNull'] extends true // Query mode
		? TColumn['_']['data'] // Query mode, not null
		: TColumn['_']['data'] | null; // Query mode, nullable

export type InferColumnsDataTypes<TColumns extends Record<string, AnyColumn>> = {
	[Key in keyof TColumns]: GetColumnData<TColumns[Key], 'query'>;
};

export interface WithEnum<T extends [string, ...string[]] = [string, ...string[]]> {
	enumValues: T;
}
