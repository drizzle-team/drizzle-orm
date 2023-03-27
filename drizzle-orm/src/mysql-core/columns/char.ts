import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume, Writable } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlCharBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlCharBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlCharHKT;
}

export interface MySqlCharHKT extends ColumnHKTBase {
	_type: MySqlChar<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlCharBuilderInitial<TName extends string, TEnum extends string[]> = MySqlCharBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: number | string;
	enum: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlCharBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<
	MySqlCharBuilderHKT,
	T,
	MySqlCharConfig
> {
	constructor(name: T['name'], config: MySqlCharConfig) {
		super(name);
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlChar<MakeColumnConfig<T, TTableName>> {
		return new MySqlChar<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlChar<T extends ColumnBaseConfig> extends MySqlColumn<MySqlCharHKT, T, MySqlCharConfig> {
	readonly length: number | undefined = this.config.length;
	readonly enum: string[] = this.config.enum ?? [];

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `char(${this.length})` : `char`;
	}
}

export interface MySqlCharConfig<TEnum extends string[] = string[]> {
	length?: number;
	enum?: TEnum;
}

export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlCharConfig<Writable<T>> = {},
): MySqlCharBuilderInitial<TName, Writable<T>> {
	return new MySqlCharBuilder(name, config);
}
