import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlTinyIntBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlTinyIntBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlTinyIntHKT;
}

export interface MySqlTinyIntHKT extends ColumnHKTBase {
	_type: MySqlTinyInt<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlTinyIntBuilderInitial<TName extends string> = MySqlTinyIntBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlTinyIntBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlTinyIntBuilderHKT, T>
{
	static readonly [entityKind]: string = 'MySqlTinyIntBuilder';

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTinyInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlTinyInt<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlTinyInt<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlTinyIntHKT, T> {
	static readonly [entityKind]: string = 'MySqlTinyInt';

	getSQLType(): string {
		return 'tinyint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint<TName extends string>(name: TName): MySqlTinyIntBuilderInitial<TName> {
	return new MySqlTinyIntBuilder(name);
}
