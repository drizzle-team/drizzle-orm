import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnySQLiteTable } from '~/table';

import { SQLiteColumn, SQLiteColumnBuilder } from './common';

type BlobMode = 'buffer' | 'json';

export class SQLiteBlobJsonBuilder<TData>
	extends SQLiteColumnBuilder<ColumnBuilderConfig & { data: TData; driverParam: Buffer }>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBlobJson<TTableName, TData> {
		return new SQLiteBlobJson(table, this);
	}
}

export class SQLiteBlobJson<TTableName extends string, TData>
	extends SQLiteColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: Buffer }>>
{
	protected override $sqliteColumnBrand!: 'SQLiteBlobJson';

	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer): TData {
		return JSON.parse(value.toString());
	}

	override mapToDriverValue(value: TData): Buffer {
		return Buffer.from(JSON.stringify(value));
	}
}

export class SQLiteBlobBufferBuilder
	extends SQLiteColumnBuilder<ColumnBuilderConfig<{ data: Buffer; driverParam: Buffer }>>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBlobBuffer<TTableName> {
		return new SQLiteBlobBuffer(table, this);
	}
}

export class SQLiteBlobBuffer<TTableName extends string>
	extends SQLiteColumn<ColumnConfig<{ tableName: TTableName; data: Buffer; driverParam: Buffer }>>
{
	protected override $sqliteColumnBrand!: 'SQLiteBlobBuffer';

	getSQLType(): string {
		return 'blob';
	}
}

export interface BlobConfig<TMode extends 'buffer' | 'json' = 'buffer' | 'json'> {
	mode: TMode;
}

export function blob(name: string, config?: BlobConfig<'buffer'>): SQLiteBlobBufferBuilder;
export function blob<T>(name: string, config: BlobConfig<'json'>): SQLiteBlobJsonBuilder<T>;
export function blob<T>(name: string, config?: BlobConfig): SQLiteBlobBufferBuilder | SQLiteBlobJsonBuilder<T> {
	if (config?.mode === 'json') {
		return new SQLiteBlobJsonBuilder<T>(name);
	}
	return new SQLiteBlobBufferBuilder(name);
}
