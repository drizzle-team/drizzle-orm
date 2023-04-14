import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlBinaryBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlBinaryBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlBinaryHKT;
}

export interface MySqlBinaryHKT extends ColumnHKTBase {
	_type: MySqlBinary<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlBinaryBuilderInitial<TName extends string> = MySqlBinaryBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlBinaryBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<
	MySqlBinaryBuilderHKT,
	T,
	MySqlBinaryConfig
> {
	constructor(name: T['name'], length: number | undefined) {
		super(name);
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBinary<MakeColumnConfig<T, TTableName>> {
		return new MySqlBinary<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlBinary<T extends ColumnBaseConfig> extends MySqlColumn<
	MySqlBinaryHKT,
	T,
	MySqlBinaryConfig
> {
	length: number | undefined = this.config.length;

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `binary(${this.length})` : `binary`;
	}
}

export interface MySqlBinaryConfig {
	length?: number;
}

export function binary<TName extends string>(
	name: TName,
	config: MySqlBinaryConfig = {},
): MySqlBinaryBuilderInitial<TName> {
	return new MySqlBinaryBuilder(name, config.length);
}
