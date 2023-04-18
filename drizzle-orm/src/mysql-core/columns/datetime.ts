import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume, Equal } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlDateTimeBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlDateTimeBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlDateTimeHKT;
}

export interface MySqlDateTimeHKT extends ColumnHKTBase {
	_type: MySqlDateTime<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlDateTimeBuilderInitial<TName extends string> = MySqlDateTimeBuilder<{
	name: TName;
	data: Date;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlDateTimeBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<
	MySqlDateTimeBuilderHKT,
	T,
	MySqlDatetimeConfig
> {
	constructor(name: T['name'], config: MySqlDatetimeConfig | undefined) {
		super(name);
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDateTime<MakeColumnConfig<T, TTableName>> {
		return new MySqlDateTime<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlDateTime<
	T extends ColumnBaseConfig,
> extends MySqlColumn<MySqlDateTimeHKT, T> {
	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateTimeBuilder<T>['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export interface MySqlDateTimeStringBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlDateTimeStringBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlDateTimeStringHKT;
}

export interface MySqlDateTimeStringHKT extends ColumnHKTBase {
	_type: MySqlDateTimeString<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlDateTimeStringBuilderInitial<TName extends string> = MySqlDateTimeStringBuilder<{
	name: TName;
	data: string;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlDateTimeStringBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<
	MySqlDateTimeStringBuilderHKT,
	T,
	MySqlDatetimeConfig
> {
	constructor(name: T['name'], config: MySqlDatetimeConfig | undefined) {
		super(name);
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDateTimeString<MakeColumnConfig<T, TTableName>> {
		return new MySqlDateTimeString<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlDateTimeString<
	T extends ColumnBaseConfig,
> extends MySqlColumn<MySqlDateTimeStringHKT, T> {
	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateTimeStringBuilder<T>['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}
}

export type DatetimeFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MySqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	fsp?: DatetimeFsp;
}

export function datetime<TName extends string, TMode extends MySqlDatetimeConfig['mode'] & {}>(
	name: TName,
	config?: MySqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlDateTimeStringBuilderInitial<TName> : MySqlDateTimeBuilderInitial<TName>;
export function datetime(name: string, config: MySqlDatetimeConfig = {}) {
	if (config.mode === 'string') {
		return new MySqlDateTimeStringBuilder(name, config);
	}
	return new MySqlDateTimeBuilder(name, config);
}
