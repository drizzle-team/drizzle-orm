import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

// INT64 as number (safe for values within Number.MAX_SAFE_INTEGER)
export type BigQueryInt64NumberBuilderInitial<TName extends string> = BigQueryInt64NumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'BigQueryInt64Number';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class BigQueryInt64NumberBuilder<T extends ColumnBuilderBaseConfig<'number', 'BigQueryInt64Number'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryInt64NumberBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'BigQueryInt64Number');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryInt64Number<MakeColumnConfig<T, TTableName>> {
		return new BigQueryInt64Number<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryInt64Number<T extends ColumnBaseConfig<'number', 'BigQueryInt64Number'>>
	extends BigQueryColumn<T>
{
	static override readonly [entityKind]: string = 'BigQueryInt64Number';

	getSQLType(): string {
		return 'INT64';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return Number(value);
	}
}

// INT64 as bigint (for full 64-bit range)
export type BigQueryInt64BigIntBuilderInitial<TName extends string> = BigQueryInt64BigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'BigQueryInt64BigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryInt64BigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'BigQueryInt64BigInt'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryInt64BigIntBuilder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'BigQueryInt64BigInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryInt64BigInt<MakeColumnConfig<T, TTableName>> {
		return new BigQueryInt64BigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryInt64BigInt<T extends ColumnBaseConfig<'bigint', 'BigQueryInt64BigInt'>>
	extends BigQueryColumn<T>
{
	static override readonly [entityKind]: string = 'BigQueryInt64BigInt';

	getSQLType(): string {
		return 'INT64';
	}

	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface BigQueryInt64Config<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function int64<TMode extends BigQueryInt64Config['mode']>(
	config: BigQueryInt64Config<TMode>,
): TMode extends 'number' ? BigQueryInt64NumberBuilderInitial<''> : BigQueryInt64BigIntBuilderInitial<''>;
export function int64<TName extends string, TMode extends BigQueryInt64Config['mode']>(
	name: TName,
	config: BigQueryInt64Config<TMode>,
): TMode extends 'number' ? BigQueryInt64NumberBuilderInitial<TName> : BigQueryInt64BigIntBuilderInitial<TName>;
export function int64(): BigQueryInt64NumberBuilderInitial<''>;
export function int64<TName extends string>(name: TName): BigQueryInt64NumberBuilderInitial<TName>;
export function int64(a?: string | BigQueryInt64Config, b?: BigQueryInt64Config) {
	const { name, config } = getColumnNameAndConfig<BigQueryInt64Config | undefined>(a, b);
	if (config?.mode === 'bigint') {
		return new BigQueryInt64BigIntBuilder(name);
	}
	return new BigQueryInt64NumberBuilder(name);
}
