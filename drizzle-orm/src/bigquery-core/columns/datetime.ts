import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

// DATETIME as Date (note: DATETIME has no timezone in BigQuery)
export type BigQueryDatetimeBuilderInitial<TName extends string> = BigQueryDatetimeBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'BigQueryDatetime';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryDatetimeBuilder<T extends ColumnBuilderBaseConfig<'date', 'BigQueryDatetime'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryDatetimeBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'BigQueryDatetime');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryDatetime<MakeColumnConfig<T, TTableName>> {
		return new BigQueryDatetime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryDatetime<T extends ColumnBaseConfig<'date', 'BigQueryDatetime'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryDatetime';

	getSQLType(): string {
		return 'DATETIME';
	}

	override mapFromDriverValue(value: string | { value: string }): Date {
		const strValue = typeof value === 'object' && 'value' in value ? value.value : value;
		return new Date(strValue);
	}

	override mapToDriverValue(value: Date): string {
		// DATETIME format: YYYY-MM-DD HH:MM:SS[.SSSSSS]
		return value.toISOString().replace('T', ' ').replace('Z', '');
	}
}

// String mode for datetime
export type BigQueryDatetimeStringBuilderInitial<TName extends string> = BigQueryDatetimeStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryDatetimeString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryDatetimeStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryDatetimeString'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryDatetimeStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'BigQueryDatetimeString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryDatetimeString<MakeColumnConfig<T, TTableName>> {
		return new BigQueryDatetimeString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryDatetimeString<T extends ColumnBaseConfig<'string', 'BigQueryDatetimeString'>>
	extends BigQueryColumn<T>
{
	static override readonly [entityKind]: string = 'BigQueryDatetimeString';

	getSQLType(): string {
		return 'DATETIME';
	}

	override mapFromDriverValue(value: string | { value: string }): string {
		return typeof value === 'object' && 'value' in value ? value.value : value;
	}
}

export interface BigQueryDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode: TMode;
}

export function datetime<TMode extends BigQueryDatetimeConfig['mode']>(
	config: BigQueryDatetimeConfig<TMode>,
): TMode extends 'string' ? BigQueryDatetimeStringBuilderInitial<''> : BigQueryDatetimeBuilderInitial<''>;
export function datetime<TName extends string, TMode extends BigQueryDatetimeConfig['mode']>(
	name: TName,
	config: BigQueryDatetimeConfig<TMode>,
): TMode extends 'string' ? BigQueryDatetimeStringBuilderInitial<TName> : BigQueryDatetimeBuilderInitial<TName>;
export function datetime(): BigQueryDatetimeBuilderInitial<''>;
export function datetime<TName extends string>(name: TName): BigQueryDatetimeBuilderInitial<TName>;
export function datetime(a?: string | BigQueryDatetimeConfig, b?: BigQueryDatetimeConfig) {
	const { name, config } = getColumnNameAndConfig<BigQueryDatetimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new BigQueryDatetimeStringBuilder(name);
	}
	return new BigQueryDatetimeBuilder(name);
}
