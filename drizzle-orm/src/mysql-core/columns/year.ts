import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlYearBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlYearBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlYearHKT;
}

export interface MySqlYearHKT extends ColumnHKTBase {
	_type: MySqlYear<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlYearBuilderInitial<TName extends string> = MySqlYearBuilder<{
	name: TName;
	data: string | number;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlYearBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<MySqlYearBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlYear<MakeColumnConfig<T, TTableName>> {
		return new MySqlYear<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlYear<
	T extends ColumnBaseConfig,
> extends MySqlColumn<MySqlYearHKT, T> {
	getSQLType(): string {
		return `year`;
	}
}

export function year<TName extends string>(name: TName): MySqlYearBuilderInitial<TName> {
	return new MySqlYearBuilder(name);
}
