import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume, Equal } from '~/utils';
import { MySqlDateBaseColumn, MySqlDateColumnBaseBuilder } from './date.common';

export interface MySqlTimestampBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlTimestampBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlTimestampHKT;
}

export interface MySqlTimestampHKT extends ColumnHKTBase {
	_type: MySqlTimestamp<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlTimestampBuilderInitial<TName extends string> = MySqlTimestampBuilder<{
	name: TName;
	data: Date;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlTimestampBuilder<T extends ColumnBuilderBaseConfig> extends MySqlDateColumnBaseBuilder<
	MySqlTimestampBuilderHKT,
	T,
	MySqlTimestampConfig
> {
	constructor(name: T['name'], config: MySqlTimestampConfig | undefined) {
		super(name);
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTimestamp<MakeColumnConfig<T, TTableName>> {
		return new MySqlTimestamp<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlTimestamp<T extends ColumnBaseConfig>
	extends MySqlDateBaseColumn<MySqlTimestampHKT, T, MySqlTimestampConfig>
{
	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? `(${this.fsp})` : '';
		return `timestamp${precision}`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export interface MySqlTimestampStringBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlTimestampStringBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlTimestampStringHKT;
}

export interface MySqlTimestampStringHKT extends ColumnHKTBase {
	_type: MySqlTimestampString<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlTimestampStringBuilderInitial<TName extends string> = MySqlTimestampStringBuilder<{
	name: TName;
	data: string;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlTimestampStringBuilder<T extends ColumnBuilderBaseConfig> extends MySqlDateColumnBaseBuilder<
	MySqlTimestampStringBuilderHKT,
	T,
	MySqlTimestampConfig
> {
	constructor(name: T['name'], config: MySqlTimestampConfig | undefined) {
		super(name);
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTimestampString<MakeColumnConfig<T, TTableName>> {
		return new MySqlTimestampString<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlTimestampString<T extends ColumnBaseConfig>
	extends MySqlDateBaseColumn<MySqlTimestampStringHKT, T, MySqlTimestampConfig>
{
	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? `(${this.fsp})` : '';
		return `timestamp${precision}`;
	}
}

export type TimestampFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MySqlTimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> {
	mode?: TMode;
	fsp?: TimestampFsp;
}

export function timestamp<TName extends string, TMode extends MySqlTimestampConfig['mode'] & {}>(
	name: TName,
	config?: MySqlTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlTimestampStringBuilderInitial<TName>
	: MySqlTimestampBuilderInitial<TName>;
export function timestamp(name: string, config: MySqlTimestampConfig = {}) {
	if (config.mode === 'string') {
		return new MySqlTimestampStringBuilder(name, config);
	}
	return new MySqlTimestampBuilder(name, config);
}
