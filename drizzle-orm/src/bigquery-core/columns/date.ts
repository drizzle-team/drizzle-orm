import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

export type BigQueryDateBuilderInitial<TName extends string> = BigQueryDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'BigQueryDate';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'BigQueryDate'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'BigQueryDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryDate<MakeColumnConfig<T, TTableName>> {
		return new BigQueryDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryDate<T extends ColumnBaseConfig<'date', 'BigQueryDate'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryDate';

	getSQLType(): string {
		return 'DATE';
	}

	override mapFromDriverValue(value: string | { value: string }): Date {
		const strValue = typeof value === 'object' && 'value' in value ? value.value : value;
		return new Date(strValue);
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString().split('T')[0]!;
	}
}

// String mode for date
export type BigQueryDateStringBuilderInitial<TName extends string> = BigQueryDateStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryDateString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryDateString'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'BigQueryDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryDateString<MakeColumnConfig<T, TTableName>> {
		return new BigQueryDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryDateString<T extends ColumnBaseConfig<'string', 'BigQueryDateString'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryDateString';

	getSQLType(): string {
		return 'DATE';
	}

	override mapFromDriverValue(value: string | { value: string }): string {
		return typeof value === 'object' && 'value' in value ? value.value : value;
	}
}

export interface BigQueryDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode: TMode;
}

export function date<TMode extends BigQueryDateConfig['mode']>(
	config: BigQueryDateConfig<TMode>,
): TMode extends 'string' ? BigQueryDateStringBuilderInitial<''> : BigQueryDateBuilderInitial<''>;
export function date<TName extends string, TMode extends BigQueryDateConfig['mode']>(
	name: TName,
	config: BigQueryDateConfig<TMode>,
): TMode extends 'string' ? BigQueryDateStringBuilderInitial<TName> : BigQueryDateBuilderInitial<TName>;
export function date(): BigQueryDateBuilderInitial<''>;
export function date<TName extends string>(name: TName): BigQueryDateBuilderInitial<TName>;
export function date(a?: string | BigQueryDateConfig, b?: BigQueryDateConfig) {
	const { name, config } = getColumnNameAndConfig<BigQueryDateConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new BigQueryDateStringBuilder(name);
	}
	return new BigQueryDateBuilder(name);
}
