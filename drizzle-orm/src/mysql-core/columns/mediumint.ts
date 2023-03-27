import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlMediumIntBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlMediumIntBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlMediumIntHKT;
}

export interface MySqlMediumIntHKT extends ColumnHKTBase {
	_type: MySqlMediumInt<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlMediumIntBuilderInitial<TName extends string> = MySqlMediumIntBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlMediumIntBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlMediumIntBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlMediumInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlMediumInt<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlMediumInt<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlMediumIntHKT, T> {
	getSQLType(): string {
		return 'mediumint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function mediumint<TName extends string>(name: TName): MySqlMediumIntBuilderInitial<TName> {
	return new MySqlMediumIntBuilder(name);
}
