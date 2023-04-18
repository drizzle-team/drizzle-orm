import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlIntBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlIntBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlIntHKT;
}

export interface MySqlIntHKT extends ColumnHKTBase {
	_type: MySqlInt<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlIntBuilderInitial<TName extends string> = MySqlIntBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlIntBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlIntBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlInt<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlInt<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlIntHKT, T> {
	getSQLType(): string {
		return 'int';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function int<TName extends string>(name: TName): MySqlIntBuilderInitial<TName> {
	return new MySqlIntBuilder(name);
}
