import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlFloatBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlFloatBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlFloatHKT;
}

export interface MySqlFloatHKT extends ColumnHKTBase {
	_type: MySqlFloat<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlFloatBuilderInitial<TName extends string> = MySqlFloatBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlFloatBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlFloatBuilderHKT, T>
{
	static readonly [entityKind]: string = 'MySqlFloatBuilder';

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlFloat<MakeColumnConfig<T, TTableName>> {
		return new MySqlFloat<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlFloat<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlFloatHKT, T> {
	static readonly [entityKind]: string = 'MySqlFloat';

	getSQLType(): string {
		return 'float';
	}
}

export function float<TName extends string>(name: TName): MySqlFloatBuilderInitial<TName> {
	return new MySqlFloatBuilder(name);
}
