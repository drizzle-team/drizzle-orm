import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';

import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlBigInt53Builder extends MySqlColumnBuilderWithAutoIncrement<
	ColumnBuilderConfig<{
		data: number;
		driverParam: number | string;
	}>
> {
	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlBigInt53<TTableName> {
		return new MySqlBigInt53(table, this.config);
	}
}

export class MySqlBigInt53<TTableName extends string> extends MySqlColumnWithAutoIncrement<
	ColumnConfig<{
		tableName: TTableName;
		data: number;
		driverParam: number | string;
	}>
> {
	declare protected $mySqlColumnBrand: 'MySqlBigInt53';

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

export class MySqlBigInt64Builder
	extends MySqlColumnBuilderWithAutoIncrement<ColumnBuilderConfig<{ data: bigint; driverParam: string }>>
{
	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlBigInt64<TTableName> {
		return new MySqlBigInt64(table, this.config);
	}
}

export class MySqlBigInt64<TTableName extends string> extends MySqlColumnWithAutoIncrement<
	ColumnConfig<{
		tableName: TTableName;
		data: bigint;
		driverParam: string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlBigInt64';

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

export function bigint(name: string, config: MySqlBigIntConfig<'number'>): MySqlBigInt53Builder;
export function bigint(name: string, config: MySqlBigIntConfig<'bigint'>): MySqlBigInt64Builder;
export function bigint(name: string, config: MySqlBigIntConfig) {
	if (config.mode === 'number') {
		return new MySqlBigInt53Builder(name);
	}
	return new MySqlBigInt64Builder(name);
}
