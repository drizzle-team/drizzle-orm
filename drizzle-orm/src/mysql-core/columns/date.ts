import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlDateBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlDateBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlDateHKT;
}

export interface MySqlDateHKT extends ColumnHKTBase {
	_type: MySqlDate<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlDateBuilderInitial<TName extends string> = MySqlDateBuilder<{
	name: TName;
	data: Date;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlDateBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<MySqlDateBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDate<MakeColumnConfig<T, TTableName>> {
		return new MySqlDate<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlDate<T extends ColumnBaseConfig> extends MySqlColumn<MySqlDateHKT, T> {
	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export interface MySqlDateStringBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlDateStringBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlDateStringHKT;
}

export interface MySqlDateStringHKT extends ColumnHKTBase {
	_type: MySqlDateString<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlDateStringBuilderInitial<TName extends string> = MySqlDateStringBuilder<{
	name: TName;
	data: string;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlDateStringBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilder<MySqlDateStringBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDateString<MakeColumnConfig<T, TTableName>> {
		return new MySqlDateString<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlDateString<T extends ColumnBaseConfig> extends MySqlColumn<MySqlDateStringHKT, T> {
	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateStringBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}
}

export function date<TName extends string>(name: TName): MySqlDateBuilderInitial<TName>;
export function date<TName extends string>(
	name: TName,
	config: { mode: 'string' },
): MySqlDateStringBuilderInitial<TName>;
export function date<TName extends string>(name: TName, config: { mode: 'date' }): MySqlDateBuilderInitial<TName>;
export function date<TName extends string>(name: TName, config?: { mode?: 'date' | 'string' }) {
	if (config?.mode === 'string') {
		return new MySqlDateStringBuilder(name);
	}
	return new MySqlDateBuilder(name);
}
