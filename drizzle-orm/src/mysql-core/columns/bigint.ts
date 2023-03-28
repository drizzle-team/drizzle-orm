import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';

import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlBigInt53BuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlBigInt53Builder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlBigInt53HKT;
}

export interface MySqlBigInt53HKT extends ColumnHKTBase {
	_type: MySqlBigInt53<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlBigInt53BuilderInitial<TName extends string> = MySqlBigInt53Builder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlBigInt53Builder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlBigInt53BuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBigInt53<MakeColumnConfig<T, TTableName>> {
		return new MySqlBigInt53<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlBigInt53<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlBigInt53HKT, T> {
	declare protected $mysqlColumnBrand: 'MySqlBigInt53';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export interface MySqlBigInt64BuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlBigInt64Builder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlBigInt64HKT;
}

export interface MySqlBigInt64HKT extends ColumnHKTBase {
	_type: MySqlBigInt64<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlBigInt64BuilderInitial<TName extends string> = MySqlBigInt64Builder<{
	name: TName;
	data: bigint;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlBigInt64Builder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlBigInt64BuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBigInt64<MakeColumnConfig<T, TTableName>> {
		return new MySqlBigInt64<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlBigInt64<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlBigInt64HKT, T> {
	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

interface MySqlBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint<TName extends string>(
	name: TName,
	config: MySqlBigIntConfig<'number'>,
): MySqlBigInt53BuilderInitial<TName>;
export function bigint<TName extends string>(
	name: TName,
	config: MySqlBigIntConfig<'bigint'>,
): MySqlBigInt64BuilderInitial<TName>;
export function bigint<TName extends string>(
	name: TName,
	config: MySqlBigIntConfig,
): MySqlBigInt53BuilderInitial<TName> | MySqlBigInt64BuilderInitial<TName> {
	if (config.mode === 'number') {
		return new MySqlBigInt53Builder<MySqlBigInt53BuilderInitial<TName>['_']['config']>(name);
	}
	return new MySqlBigInt64Builder<MySqlBigInt64BuilderInitial<TName>['_']['config']>(name);
}
