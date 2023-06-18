import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
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
	static readonly [entityKind]: string = 'MySqlBigInt53Builder';

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBigInt53<MakeColumnConfig<T, TTableName>> {
		return new MySqlBigInt53<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlBigInt53<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlBigInt53HKT, T> {
	static readonly [entityKind]: string = 'MySqlBigInt53';

	declare protected $mysqlColumnBrand: 'MySqlBigInt53';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return Number(value);
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
	static readonly [entityKind]: string = 'MySqlBigInt64Builder';

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBigInt64<MakeColumnConfig<T, TTableName>> {
		return new MySqlBigInt64<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlBigInt64<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<MySqlBigInt64HKT, T> {
	static readonly [entityKind]: string = 'MySqlBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

interface MySqlBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint<TName extends string, TMode extends MySqlBigIntConfig['mode']>(
	name: TName,
	config: MySqlBigIntConfig<TMode>,
): TMode extends 'number' ? MySqlBigInt53BuilderInitial<TName> : MySqlBigInt64BuilderInitial<TName>;
export function bigint(name: string, config: MySqlBigIntConfig) {
	if (config.mode === 'number') {
		return new MySqlBigInt53Builder(name);
	}
	return new MySqlBigInt64Builder(name);
}
