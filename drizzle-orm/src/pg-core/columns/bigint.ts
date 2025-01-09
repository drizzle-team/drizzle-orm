import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';

import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBaseBuilder } from './int.common.ts';

export type PgBigInt53BuilderInitial<TName extends string> = PgBigInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'PgBigInt53';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class PgBigInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'PgBigInt53'>>
	extends PgIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'PgBigInt53Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgBigInt53');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBigInt53<MakeColumnConfig<T, TTableName>> {
		return new PgBigInt53<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgBigInt53<T extends ColumnBaseConfig<'number', 'PgBigInt53'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBigInt53';

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

export type PgBigInt64BuilderInitial<TName extends string> = PgBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'PgBigInt64';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint', 'PgBigInt64'>>
	extends PgIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'PgBigInt64Builder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'PgBigInt64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBigInt64<MakeColumnConfig<T, TTableName>> {
		return new PgBigInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgBigInt64<T extends ColumnBaseConfig<'bigint', 'PgBigInt64'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface PgBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint<TMode extends PgBigIntConfig['mode']>(
	config: PgBigIntConfig<TMode>,
): TMode extends 'number' ? PgBigInt53BuilderInitial<''> : PgBigInt64BuilderInitial<''>;
export function bigint<TName extends string, TMode extends PgBigIntConfig['mode']>(
	name: TName,
	config: PgBigIntConfig<TMode>,
): TMode extends 'number' ? PgBigInt53BuilderInitial<TName> : PgBigInt64BuilderInitial<TName>;
export function bigint(a: string | PgBigIntConfig, b?: PgBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<PgBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new PgBigInt53Builder(name);
	}
	return new PgBigInt64Builder(name);
}
