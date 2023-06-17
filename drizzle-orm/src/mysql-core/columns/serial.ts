import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlSerialBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlSerialBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlSerialHKT;
}

export interface MySqlSerialHKT extends ColumnHKTBase {
	_type: MySqlSerial<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlSerialBuilderInitial<TName extends string> = MySqlSerialBuilder<{
	name: TName;
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}>;

export class MySqlSerialBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlSerialBuilderHKT, T>
{
	static readonly [entityKind]: string = 'MySqlSerialBuilder';

	constructor(name: T['name']) {
		super(name);
		this.config.hasDefault = true;
		this.config.autoIncrement = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlSerial<MakeColumnConfig<T, TTableName>> {
		return new MySqlSerial<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlSerial<
	T extends ColumnBaseConfig,
> extends MySqlColumnWithAutoIncrement<MySqlSerialHKT, T> {
	static readonly [entityKind]: string = 'MySqlSerial';

	getSQLType(): string {
		return 'serial';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function serial<TName extends string>(name: TName): MySqlSerialBuilderInitial<TName> {
	return new MySqlSerialBuilder(name);
}
