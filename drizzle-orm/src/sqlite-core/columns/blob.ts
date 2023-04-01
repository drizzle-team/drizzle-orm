import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import type { Assume } from '~/utils';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

type BlobMode = 'buffer' | 'json';

export interface SQLiteBlobJsonBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteBlobJsonBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteBlobJsonHKT;
}

export interface SQLiteBlobJsonHKT extends ColumnHKTBase {
	_type: SQLiteBlobJson<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteBlobJsonBuilderInitial<TName extends string> = SQLiteBlobJsonBuilder<{
	name: TName;
	data: unknown;
	driverParam: Buffer;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteBlobJsonBuilder<T extends ColumnBuilderBaseConfig>
	extends SQLiteColumnBuilder<SQLiteBlobJsonBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBlobJson<MakeColumnConfig<T, TTableName>> {
		return new SQLiteBlobJson<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class SQLiteBlobJson<T extends ColumnBaseConfig> extends SQLiteColumn<SQLiteBlobJsonHKT, T> {
	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer): T['data'] {
		return JSON.parse(value.toString());
	}

	override mapToDriverValue(value: T['data']): Buffer {
		return Buffer.from(JSON.stringify(value));
	}
}

export interface SQLiteBlobBufferBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteBlobBufferBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteBlobBufferHKT;
}

export interface SQLiteBlobBufferHKT extends ColumnHKTBase {
	_type: SQLiteBlobBuffer<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteBlobBufferBuilderInitial<TName extends string> = SQLiteBlobBufferBuilder<{
	name: TName;
	data: Buffer;
	driverParam: Buffer;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteBlobBufferBuilder<T extends ColumnBuilderBaseConfig>
	extends SQLiteColumnBuilder<SQLiteBlobBufferBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBlobBuffer<MakeColumnConfig<T, TTableName>> {
		return new SQLiteBlobBuffer<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class SQLiteBlobBuffer<T extends ColumnBaseConfig> extends SQLiteColumn<SQLiteBlobBufferHKT, T> {
	getSQLType(): string {
		return 'blob';
	}
}

export interface BlobConfig<TMode extends BlobMode = BlobMode> {
	mode: TMode;
}

export function blob<TName extends string, TMode extends BlobMode = 'buffer'>(
	name: TName,
	config?: BlobConfig<TMode>,
): TMode extends 'buffer' ? SQLiteBlobBufferBuilderInitial<TName> : SQLiteBlobJsonBuilderInitial<TName>;
export function blob(name: string, config?: BlobConfig) {
	if (config?.mode === 'json') {
		return new SQLiteBlobJsonBuilder(name);
	}
	return new SQLiteBlobBufferBuilder(name);
}
