import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

export type BigQueryTimestampBuilderInitial<TName extends string> = BigQueryTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'BigQueryTimestamp';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'BigQueryTimestamp'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryTimestampBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'BigQueryTimestamp');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryTimestamp<MakeColumnConfig<T, TTableName>> {
		return new BigQueryTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryTimestamp<T extends ColumnBaseConfig<'date', 'BigQueryTimestamp'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryTimestamp';

	getSQLType(): string {
		return 'TIMESTAMP';
	}

	override mapFromDriverValue(value: string | { value: string }): Date {
		// BigQuery returns timestamps as ISO strings or objects
		const strValue = typeof value === 'object' && 'value' in value ? value.value : value;
		return new Date(strValue);
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString();
	}
}

// String mode for timestamp (returns raw string)
export type BigQueryTimestampStringBuilderInitial<TName extends string> = BigQueryTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryTimestampString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryTimestampStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryTimestampString'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryTimestampStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'BigQueryTimestampString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryTimestampString<MakeColumnConfig<T, TTableName>> {
		return new BigQueryTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryTimestampString<T extends ColumnBaseConfig<'string', 'BigQueryTimestampString'>>
	extends BigQueryColumn<T>
{
	static override readonly [entityKind]: string = 'BigQueryTimestampString';

	getSQLType(): string {
		return 'TIMESTAMP';
	}

	override mapFromDriverValue(value: string | { value: string }): string {
		return typeof value === 'object' && 'value' in value ? value.value : value;
	}
}

export interface BigQueryTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode: TMode;
}

export function timestamp<TMode extends BigQueryTimestampConfig['mode']>(
	config: BigQueryTimestampConfig<TMode>,
): TMode extends 'string' ? BigQueryTimestampStringBuilderInitial<''> : BigQueryTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends BigQueryTimestampConfig['mode']>(
	name: TName,
	config: BigQueryTimestampConfig<TMode>,
): TMode extends 'string' ? BigQueryTimestampStringBuilderInitial<TName> : BigQueryTimestampBuilderInitial<TName>;
export function timestamp(): BigQueryTimestampBuilderInitial<''>;
export function timestamp<TName extends string>(name: TName): BigQueryTimestampBuilderInitial<TName>;
export function timestamp(a?: string | BigQueryTimestampConfig, b?: BigQueryTimestampConfig) {
	const { name, config } = getColumnNameAndConfig<BigQueryTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new BigQueryTimestampStringBuilder(name);
	}
	return new BigQueryTimestampBuilder(name);
}
