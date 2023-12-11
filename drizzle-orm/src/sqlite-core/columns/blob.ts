import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable } from '~/sqlite-core/table.ts';
import type { Equal } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

type BlobMode = 'buffer' | 'json' | 'bigint';

export type SQLiteBigIntBuilderInitial<TName extends string> = SQLiteBigIntBuilder<
	{
		name: TName;
		dataType: 'bigint';
		columnType: 'SQLiteBigInt';
		data: bigint;
		driverParam: Buffer;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class SQLiteBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'SQLiteBigInt'>>
	extends SQLiteColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SQLiteBigIntBuilder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'SQLiteBigInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBigInt<MakeColumnConfig<T, TTableName>> {
		return new SQLiteBigInt<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any>);
	}
}

export class SQLiteBigInt<T extends ColumnBaseConfig<'bigint', 'SQLiteBigInt'>> extends SQLiteColumn<T> {
	static readonly [entityKind]: string = 'SQLiteBigInt';

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

export type SQLiteBlobJsonBuilderInitial<TName extends string> = SQLiteBlobJsonBuilder<
	{
		name: TName;
		dataType: 'json';
		columnType: 'SQLiteBlobJson';
		data: unknown;
		driverParam: Buffer;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class SQLiteBlobJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'SQLiteBlobJson'>>
	extends SQLiteColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SQLiteBlobJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'SQLiteBlobJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBlobJson<MakeColumnConfig<T, TTableName>> {
		return new SQLiteBlobJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any>,
		);
	}
}

export class SQLiteBlobJson<T extends ColumnBaseConfig<'json', 'SQLiteBlobJson'>> extends SQLiteColumn<T> {
	static readonly [entityKind]: string = 'SQLiteBlobJson';

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

export type SQLiteBlobBufferBuilderInitial<TName extends string> = SQLiteBlobBufferBuilder<
	{
		name: TName;
		dataType: 'buffer';
		columnType: 'SQLiteBlobBuffer';
		data: Buffer;
		driverParam: Buffer;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class SQLiteBlobBufferBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'SQLiteBlobBuffer'>>
	extends SQLiteColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SQLiteBlobBufferBuilder';

	constructor(name: T['name']) {
		super(name, 'buffer', 'SQLiteBlobBuffer');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBlobBuffer<MakeColumnConfig<T, TTableName>> {
		return new SQLiteBlobBuffer<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any>);
	}
}

export class SQLiteBlobBuffer<T extends ColumnBaseConfig<'buffer', 'SQLiteBlobBuffer'>> extends SQLiteColumn<T> {
	static readonly [entityKind]: string = 'SQLiteBlobBuffer';

	getSQLType(): string {
		return 'blob';
	}
}

export interface BlobConfig<TMode extends BlobMode = BlobMode> {
	mode: TMode;
}

/**
 *  It's recommended to use `text('...', { mode: 'json' })` instead of `blob` in JSON mode, because it supports JSON functions:
 * >All JSON functions currently throw an error if any of their arguments are BLOBs because BLOBs are reserved for a future enhancement in which BLOBs will store the binary encoding for JSON.
 *
 * https://www.sqlite.org/json1.html
 */
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
