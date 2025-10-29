import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
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
	extends MySqlColumnBuilderWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlBigInt53Builder';

	constructor(name: T['name'], unsigned: boolean = false) {
		super(name, 'number', 'MySqlBigInt53');
		this.config.unsigned = unsigned;
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
	extends MySqlColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlBigInt53';

	getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
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
	extends MySqlColumnBuilderWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlBigInt64Builder';

	constructor(name: T['name'], unsigned: boolean = false) {
		super(name, 'bigint', 'MySqlBigInt64');
		this.config.unsigned = unsigned;
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
	extends MySqlColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlBigInt64';

	getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface MySqlBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
	unsigned?: boolean;
}

export function bigint<TMode extends MySqlBigIntConfig['mode']>(
	config: MySqlBigIntConfig<TMode>,
): TMode extends 'number' ? MySqlBigInt53BuilderInitial<''> : MySqlBigInt64BuilderInitial<''>;
export function bigint<TName extends string, TMode extends MySqlBigIntConfig['mode']>(
	name: TName,
	config: MySqlBigIntConfig<TMode>,
): TMode extends 'number' ? MySqlBigInt53BuilderInitial<TName> : MySqlBigInt64BuilderInitial<TName>;
export function bigint(a?: string | MySqlBigIntConfig, b?: MySqlBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new MySqlBigInt53Builder(name, config.unsigned);
	}
	return new MySqlBigInt64Builder(name, config.unsigned);
}
