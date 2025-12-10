import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

export type BigQueryStringBuilderInitial<TName extends string> = BigQueryStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryString'>>
	extends BigQueryColumnBuilder<T, { length: number | undefined }>
{
	static override readonly [entityKind]: string = 'BigQueryStringBuilder';

	constructor(name: T['name'], length?: number) {
		super(name, 'string', 'BigQueryString');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryString<MakeColumnConfig<T, TTableName>> {
		return new BigQueryString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryString<T extends ColumnBaseConfig<'string', 'BigQueryString'>>
	extends BigQueryColumn<T, { length: number | undefined }>
{
	static override readonly [entityKind]: string = 'BigQueryString';

	readonly length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? 'STRING' : `STRING(${this.length})`;
	}
}

export interface BigQueryStringConfig {
	length?: number;
}

export function string(): BigQueryStringBuilderInitial<''>;
export function string<TName extends string>(name: TName): BigQueryStringBuilderInitial<TName>;
export function string(config: BigQueryStringConfig): BigQueryStringBuilderInitial<''>;
export function string<TName extends string>(
	name: TName,
	config: BigQueryStringConfig,
): BigQueryStringBuilderInitial<TName>;
export function string(a?: string | BigQueryStringConfig, b?: BigQueryStringConfig) {
	if (typeof a === 'object') {
		return new BigQueryStringBuilder('', a.length);
	}
	return new BigQueryStringBuilder(a ?? '', b?.length);
}
