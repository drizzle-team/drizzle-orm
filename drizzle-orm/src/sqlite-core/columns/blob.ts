import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import type { Assume, Equal } from '~/utils';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

type BlobMode = 'buffer' | 'json' | 'bigint';

export interface SQLiteBigIntBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteBigIntBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteBigIntHKT;
}

export interface SQLiteBigIntHKT extends ColumnHKTBase {
	_type: SQLiteBigInt<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteBigIntBuilderInitial<TName extends string> = SQLiteBigIntBuilder<{
	name: TName;
	data: bigint;
	driverParam: Buffer;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteBigIntBuilder<T extends ColumnBuilderBaseConfig>
	extends SQLiteColumnBuilder<SQLiteBigIntBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBigInt<MakeColumnConfig<T, TTableName>> {
		return new SQLiteBigInt<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class SQLiteBigInt<T extends ColumnBaseConfig> extends SQLiteColumn<SQLiteBigIntHKT, T> {
	declare protected $sqliteColumnBrand: 'SQLiteBigInt';

	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer): bigint {
		return BigInt(value.toString());
	}

	override mapToDriverValue(value: bigint): Buffer {
		return Buffer.from(value.toString());
	}
}

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
	declare protected $sqliteColumnBrand: 'SQLiteBlobJson';

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

export function blob<TName extends string, TMode extends BlobMode = BlobMode>(
	name: TName,
	config?: BlobConfig<TMode>,
): Equal<TMode, 'bigint'> extends true ? SQLiteBigIntBuilderInitial<TName>
	: Equal<TMode, 'buffer'> extends true ? SQLiteBlobBufferBuilderInitial<TName>
	: SQLiteBlobJsonBuilderInitial<TName>;
export function blob(name: string, config?: BlobConfig) {
	if (config?.mode === 'json') {
		return new SQLiteBlobJsonBuilder(name);
	}
	if (config?.mode === 'bigint') {
		return new SQLiteBigIntBuilder(name);
	}
	return new SQLiteBlobBufferBuilder(name);
}
