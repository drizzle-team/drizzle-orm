import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume, Writable } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlVarCharBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlVarCharBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlVarCharHKT;
}

export interface MySqlVarCharHKT extends ColumnHKTBase {
	_type: MySqlVarChar<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlVarCharBuilderInitial<TName extends string, TEnum extends string[]> = MySqlVarCharBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: number | string;
	enum: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlVarCharBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilder<MySqlVarCharBuilderHKT, T, MySqlVarcharConfig>
{
	/** @internal */
	constructor(name: T['name'], config: MySqlVarcharConfig) {
		super(name);
		this.config.length = config.length;
		this.config.enum = config.enum ?? [];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarChar<MakeColumnConfig<T, TTableName>> {
		return new MySqlVarChar<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlVarChar<T extends ColumnBaseConfig> extends MySqlColumn<MySqlVarCharHKT, T, MySqlVarcharConfig> {
	readonly length: number | undefined = this.config.length;
	readonly enum: string[] | undefined = this.config.enum;

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `varchar(${this.length})` : `varchar`;
	}
}

export interface MySqlVarcharConfig<TEnum extends string[] = string[]> {
	length: number;
	enum?: TEnum;
}

export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlVarcharConfig<Writable<T>>,
): MySqlVarCharBuilderInitial<TName, Writable<T>> {
	return new MySqlVarCharBuilder(name, config);
}
