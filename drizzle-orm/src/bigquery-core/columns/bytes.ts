import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

export type BigQueryBytesBuilderInitial<TName extends string> = BigQueryBytesBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'BigQueryBytes';
	data: Buffer;
	driverParam: Buffer | Uint8Array | string;
	enumValues: undefined;
}>;

export class BigQueryBytesBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'BigQueryBytes'>>
	extends BigQueryColumnBuilder<T, { length: number | undefined }>
{
	static override readonly [entityKind]: string = 'BigQueryBytesBuilder';

	constructor(name: T['name'], length?: number) {
		super(name, 'buffer', 'BigQueryBytes');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryBytes<MakeColumnConfig<T, TTableName>> {
		return new BigQueryBytes<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryBytes<T extends ColumnBaseConfig<'buffer', 'BigQueryBytes'>>
	extends BigQueryColumn<T, { length: number | undefined }>
{
	static override readonly [entityKind]: string = 'BigQueryBytes';

	readonly length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? 'BYTES' : `BYTES(${this.length})`;
	}

	override mapFromDriverValue(value: string | Buffer | Uint8Array): Buffer {
		if (typeof value === 'string') {
			// BigQuery returns base64-encoded bytes
			return Buffer.from(value, 'base64');
		}
		if (value instanceof Uint8Array) {
			return Buffer.from(value);
		}
		return value;
	}

	override mapToDriverValue(value: Buffer | Uint8Array): string {
		// Convert to base64 for BigQuery
		return Buffer.from(value).toString('base64');
	}
}

export interface BigQueryBytesConfig {
	length?: number;
}

export function bytes(): BigQueryBytesBuilderInitial<''>;
export function bytes<TName extends string>(name: TName): BigQueryBytesBuilderInitial<TName>;
export function bytes(config: BigQueryBytesConfig): BigQueryBytesBuilderInitial<''>;
export function bytes<TName extends string>(
	name: TName,
	config: BigQueryBytesConfig,
): BigQueryBytesBuilderInitial<TName>;
export function bytes(a?: string | BigQueryBytesConfig, b?: BigQueryBytesConfig) {
	if (typeof a === 'object') {
		return new BigQueryBytesBuilder('', a.length);
	}
	return new BigQueryBytesBuilder(a ?? '', b?.length);
}
