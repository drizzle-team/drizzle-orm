import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlBigInt53BuilderInitial<TName extends string> = MsSqlBigInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlBigInt53';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlBigInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlBigInt53'>>
	extends MsSqlColumnBuilderWithIdentity<T, { unsigned: boolean }>
{
	static readonly [entityKind]: string = 'MsSqlBigInt53Builder';

	constructor(name: T['name'], unsigned: boolean = false) {
		super(name, 'number', 'MsSqlBigInt53');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlBigInt53<MakeColumnConfig<T, TTableName>> {
		return new MsSqlBigInt53<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlBigInt53<T extends ColumnBaseConfig<'number', 'MsSqlBigInt53'>>
	extends MsSqlColumnWithIdentity<T, { unsigned: boolean }>
{
	static readonly [entityKind]: string = 'MsSqlBigInt53';

	_getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return Number(value);
	}
}

export type MsSqlBigInt64BuilderInitial<TName extends string> = MsSqlBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'MsSqlBigInt64';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint', 'MsSqlBigInt64'>>
	extends MsSqlColumnBuilderWithIdentity<T, { unsigned: boolean }>
{
	static readonly [entityKind]: string = 'MsSqlBigInt64Builder';

	constructor(name: T['name'], unsigned: boolean = false) {
		super(name, 'bigint', 'MsSqlBigInt64');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlBigInt64<MakeColumnConfig<T, TTableName>> {
		return new MsSqlBigInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlBigInt64<T extends ColumnBaseConfig<'bigint', 'MsSqlBigInt64'>>
	extends MsSqlColumnWithIdentity<T, { unsigned: boolean }>
{
	static readonly [entityKind]: string = 'MsSqlBigInt64';

	_getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

interface MsSqlBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
	unsigned?: boolean;
}

export function bigint<TName extends string, TMode extends MsSqlBigIntConfig['mode']>(
	name: TName,
	config: MsSqlBigIntConfig<TMode>,
): TMode extends 'number' ? MsSqlBigInt53BuilderInitial<TName> : MsSqlBigInt64BuilderInitial<TName>;
export function bigint(name: string, config: MsSqlBigIntConfig) {
	if (config.mode === 'number') {
		return new MsSqlBigInt53Builder(name, config.unsigned);
	}
	return new MsSqlBigInt64Builder(name, config.unsigned);
}
