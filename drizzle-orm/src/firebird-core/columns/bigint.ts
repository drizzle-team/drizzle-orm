import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';

import { getColumnNameAndConfig } from '~/utils.ts';
import { FirebirdColumn } from './common.ts';
import { FirebirdIntColumnBaseBuilder } from './int.common.ts';

export type FirebirdBigInt53BuilderInitial<TName extends string> = FirebirdBigInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'FirebirdBigInt53';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class FirebirdBigInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'FirebirdBigInt53'>>
	extends FirebirdIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdBigInt53Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'FirebirdBigInt53');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdBigInt53<MakeColumnConfig<T, TTableName>> {
		return new FirebirdBigInt53<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdBigInt53<T extends ColumnBaseConfig<'number', 'FirebirdBigInt53'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdBigInt53';

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

export type FirebirdBigInt64BuilderInitial<TName extends string> = FirebirdBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'FirebirdBigInt64';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class FirebirdBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint', 'FirebirdBigInt64'>>
	extends FirebirdIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdBigInt64Builder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'FirebirdBigInt64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdBigInt64<MakeColumnConfig<T, TTableName>> {
		return new FirebirdBigInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdBigInt64<T extends ColumnBaseConfig<'bigint', 'FirebirdBigInt64'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: number | string): bigint {
		return BigInt(value);
	}

	override mapToDriverValue = String;
}

export interface FirebirdBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint<TMode extends FirebirdBigIntConfig['mode']>(
	config: FirebirdBigIntConfig<TMode>,
): TMode extends 'number' ? FirebirdBigInt53BuilderInitial<''> : FirebirdBigInt64BuilderInitial<''>;
export function bigint<TName extends string, TMode extends FirebirdBigIntConfig['mode']>(
	name: TName,
	config: FirebirdBigIntConfig<TMode>,
): TMode extends 'number' ? FirebirdBigInt53BuilderInitial<TName> : FirebirdBigInt64BuilderInitial<TName>;
export function bigint(a: string | FirebirdBigIntConfig, b?: FirebirdBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<FirebirdBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new FirebirdBigInt53Builder(name);
	}
	return new FirebirdBigInt64Builder(name);
}
