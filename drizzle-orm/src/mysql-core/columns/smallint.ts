import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlSmallIntBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlSmallIntBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlSmallIntHKT;
}

export interface MySqlSmallIntHKT extends ColumnHKTBase {
	_type: MySqlSmallInt<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlSmallIntBuilderInitial<TName extends string> = MySqlSmallIntBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlSmallIntBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlSmallIntBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlSmallInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlSmallInt<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlSmallInt<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlSmallIntHKT, T> {
	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint<TName extends string>(name: TName): MySqlSmallIntBuilderInitial<TName> {
	return new MySqlSmallIntBuilder(name);
}
