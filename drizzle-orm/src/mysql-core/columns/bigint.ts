import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlBigInt53BuilderInitial<TName extends string> = MySqlBigInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlBigInt53';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlBigInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'MySqlBigInt53'>>
	extends MySqlColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlBigInt53Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'MySqlBigInt53');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBigInt53<MakeColumnConfig<T, TTableName>> {
		return new MySqlBigInt53<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlBigInt53<T extends ColumnBaseConfig<'number', 'MySqlBigInt53'>>
	extends MySqlColumnWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlBigInt53';

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

export type MySqlBigInt64BuilderInitial<TName extends string> = MySqlBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'MySqlBigInt64';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint', 'MySqlBigInt64'>>
	extends MySqlColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlBigInt64Builder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'MySqlBigInt64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBigInt64<MakeColumnConfig<T, TTableName>> {
		return new MySqlBigInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlBigInt64<T extends ColumnBaseConfig<'bigint', 'MySqlBigInt64'>>
	extends MySqlColumnWithAutoIncrement<T>
{
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
