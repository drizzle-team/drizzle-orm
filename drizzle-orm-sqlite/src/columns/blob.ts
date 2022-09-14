import {
	ColumnData,
	ColumnDriverParam,
	ColumnHasDefault,
	ColumnNotNull,
	TableName,
	Unwrap,
} from 'drizzle-orm/branded-types';

import { AnySQLiteTable } from '~/table';

import { SQLiteColumnBuilder, SQLiteColumn } from './common';

type BlobMode = 'buffer' | 'json';

export class SQLiteBlobJsonBuilder<
	TData,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends SQLiteColumnBuilder<ColumnData<TData>, ColumnDriverParam<Buffer>, TNotNull, THasDefault> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnySQLiteTable<TTableName>,
	): SQLiteBlobJson<TTableName, TData, TNotNull, THasDefault> {
		return new SQLiteBlobJson(table, this);
	}
}

export class SQLiteBlobJson<
	TTableName extends TableName,
	TData,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends SQLiteColumn<
	TTableName,
	ColumnData<TData>,
	ColumnDriverParam<Buffer>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'SQLiteBlobJson';

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

export class SQLiteBlobBufferBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends SQLiteColumnBuilder<
	ColumnData<Buffer>,
	ColumnDriverParam<Buffer>,
	TNotNull,
	THasDefault
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnySQLiteTable<TTableName>,
	): SQLiteBlobBuffer<TTableName, TNotNull, THasDefault> {
		return new SQLiteBlobBuffer(table, this);
	}
}

export class SQLiteBlobBuffer<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends SQLiteColumn<
	TTableName,
	ColumnData<Buffer>,
	ColumnDriverParam<Buffer>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'SQLiteBlob';

	getSQLType(): string {
		return 'blob';
	}
}

export function blob(name: string, mode: 'buffer'): SQLiteBlobBufferBuilder;
export function blob<T>(name: string, mode: 'json'): SQLiteBlobJsonBuilder<T>;
export function blob<T>(
	name: string,
	mode: BlobMode,
): SQLiteBlobBufferBuilder | SQLiteBlobJsonBuilder<T> {
	if (mode === 'buffer') {
		return new SQLiteBlobBufferBuilder(name);
	}
	return new SQLiteBlobJsonBuilder<T>(name);
}
