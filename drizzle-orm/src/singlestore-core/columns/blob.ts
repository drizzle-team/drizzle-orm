import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table';
import { sql } from '~/sql/sql.ts';
import type { Equal } from '~/utils';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreBlobBuilderInitial<TName extends string> = SingleStoreBlobBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreBlob';
	data: Uint8Array;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBlobBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreBlob'>>
	extends SingleStoreColumnBuilder<T, SingleStoreBlobConfig>
{
	static readonly [entityKind]: string = 'SingleStoreBlobBuilder';

	constructor(name: T['name'], _config?: SingleStoreBlobConfig) {
		super(name, 'string', 'SingleStoreBlob');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBlob<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBlob(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreBlob<T extends ColumnBaseConfig<'string', 'SingleStoreBlob'>> extends SingleStoreColumn<T> {
	static readonly [entityKind]: string = 'SingleStoreBlob';

	constructor(table: AnySingleStoreTable<{ name: T['tableName'] }>, config: SingleStoreBlobBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'binary(16)';
	}

	override mapToDriverValue(value: string) {
		return sql`UNHEX(REPLACE(${value}, "-", ""))`;
	}
}

export type SingleStoreBlobStringBuilderInitial<TName extends string> = SingleStoreBlobStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreBlobString';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBlobStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreBlobString'>>
	extends SingleStoreColumnBuilder<T, SingleStoreBlobConfig>
{
	static readonly [entityKind]: string = 'SingleStoreBlobStringBuilder';

	constructor(name: T['name'], _config?: SingleStoreBlobConfig) {
		super(name, 'string', 'SingleStoreBlobString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBlobString<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBlobString(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreBlobString<T extends ColumnBaseConfig<'string', 'SingleStoreBlobString'>>
	extends SingleStoreColumn<T>
{
	static readonly [entityKind]: string = 'SingleStoreBlobString';

	constructor(table: AnySingleStoreTable<{ name: T['tableName'] }>, config: SingleStoreBlobStringBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'binary(16)';
	}

	override mapToDriverValue(value: string) {
		return sql`UNHEX(REPLACE(${value}, "-", ""))`;
	}

	override mapFromDriverValue(value: Uint8Array): string {
		const hex = Buffer.from(value).toString('hex');
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
}

export interface SingleStoreBlobConfig<TMode extends 'string' | 'buffer' = 'string' | 'buffer'> {
	mode?: TMode;
}

/**
 * Creates a column with the data type `BINARY(16)`
 *
 * Use config `{ mode: "string" }` for a string representation of the Blob
 */
export function blob<TName extends string, TMode extends SingleStoreBlobConfig['mode'] & {}>(
	name: TName,
	config?: SingleStoreBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreBlobStringBuilderInitial<TName>
	: SingleStoreBlobBuilderInitial<TName>;
export function blob(name: string, config?: SingleStoreBlobConfig) {
	if (config?.mode === 'string') {
		return new SingleStoreBlobStringBuilder(name, config);
	}
	return new SingleStoreBlobBuilder(name, config);
}
