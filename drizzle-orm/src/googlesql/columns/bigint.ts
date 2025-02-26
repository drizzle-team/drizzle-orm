import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';

export type GoogleSqlBigInt53BuilderInitial<TName extends string> = GoogleSqlBigInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlBigInt53';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlBigInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlBigInt53'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'GoogleSqlBigInt53Builder';

	constructor(name: T['name'], unsigned: boolean = false) {
		super(name, 'number', 'GoogleSqlBigInt53');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlBigInt53<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlBigInt53<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlBigInt53<T extends ColumnBaseConfig<'number', 'GoogleSqlBigInt53'>>
	extends GoogleSqlColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'GoogleSqlBigInt53';

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

export type GoogleSqlBigInt64BuilderInitial<TName extends string> = GoogleSqlBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'GoogleSqlBigInt64';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class GoogleSqlBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint', 'GoogleSqlBigInt64'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'GoogleSqlBigInt64Builder';

	constructor(name: T['name'], unsigned: boolean = false) {
		super(name, 'bigint', 'GoogleSqlBigInt64');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlBigInt64<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlBigInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlBigInt64<T extends ColumnBaseConfig<'bigint', 'GoogleSqlBigInt64'>>
	extends GoogleSqlColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'GoogleSqlBigInt64';

	getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface GoogleSqlBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
	unsigned?: boolean;
}

export function bigint<TMode extends GoogleSqlBigIntConfig['mode']>(
	config: GoogleSqlBigIntConfig<TMode>,
): TMode extends 'number' ? GoogleSqlBigInt53BuilderInitial<''> : GoogleSqlBigInt64BuilderInitial<''>;
export function bigint<TName extends string, TMode extends GoogleSqlBigIntConfig['mode']>(
	name: TName,
	config: GoogleSqlBigIntConfig<TMode>,
): TMode extends 'number' ? GoogleSqlBigInt53BuilderInitial<TName> : GoogleSqlBigInt64BuilderInitial<TName>;
export function bigint(a?: string | GoogleSqlBigIntConfig, b?: GoogleSqlBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new GoogleSqlBigInt53Builder(name, config.unsigned);
	}
	return new GoogleSqlBigInt64Builder(name, config.unsigned);
}
