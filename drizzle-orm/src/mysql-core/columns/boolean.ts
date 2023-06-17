import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlBooleanBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlBooleanBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlBooleanHKT;
}

export interface MySqlBooleanHKT extends ColumnHKTBase {
	_type: MySqlBoolean<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlBooleanBuilderInitial<TName extends string> = MySqlBooleanBuilder<{
	name: TName;
	data: boolean;
	driverParam: number | boolean;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlBooleanBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilder<MySqlBooleanBuilderHKT, T>
{
	static readonly [entityKind]: string = 'MySqlBooleanBuilder';

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBoolean<MakeColumnConfig<T, TTableName>> {
		return new MySqlBoolean<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlBoolean<T extends ColumnBaseConfig> extends MySqlColumn<MySqlBooleanHKT, T> {
	static readonly [entityKind]: string = 'MySqlBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: number | boolean): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	}
}

export function boolean<TName extends string>(name: TName): MySqlBooleanBuilderInitial<TName> {
	return new MySqlBooleanBuilder(name);
}
