import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { Writable } from '~/utils.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

export interface ClickHouseStringConfig<TEnum extends readonly string[] | string[] | undefined = undefined> {
	/**
	 * Narrows the TypeScript type of the column to a union of string literals.
	 *
	 * This is a type-level constraint only — unlike {@link enum8}/{@link enum16} it is not enforced by
	 * ClickHouse, and the column is still stored as a plain `String`.
	 */
	enum?: TEnum;
}

export type ClickHouseStringBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	ClickHouseStringBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'ClickHouseString';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	}>;

export class ClickHouseStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'ClickHouseString'>>
	extends ClickHouseColumnBuilder<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'ClickHouseStringBuilder';

	constructor(name: T['name'], config: ClickHouseStringConfig<T['enumValues']>) {
		super(name, 'string', 'ClickHouseString');
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseString<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseString<T extends ColumnBaseConfig<'string', 'ClickHouseString'>>
	extends ClickHouseColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'ClickHouseString';

	override readonly enumValues = this.config.enumValues;

	getBaseSQLType(): string {
		return 'String';
	}
}

/**
 * `String` — an arbitrary-length byte string. ClickHouse does not enforce a length limit and treats
 * the value as bytes, so encoding is up to the application.
 */
export function string(): ClickHouseStringBuilderInitial<'', [string, ...string[]]>;
export function string<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: ClickHouseStringConfig<T | Writable<T>>,
): ClickHouseStringBuilderInitial<'', Writable<T>>;
export function string<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: ClickHouseStringConfig<T | Writable<T>>,
): ClickHouseStringBuilderInitial<TName, Writable<T>>;
export function string(a?: string | ClickHouseStringConfig, b: ClickHouseStringConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<ClickHouseStringConfig>(a, b);
	return new ClickHouseStringBuilder(name, config as any);
}

export interface ClickHouseFixedStringConfig<TEnum extends readonly string[] | string[] | undefined = undefined> {
	/** The exact byte length of the column. Shorter values are right-padded with null bytes. */
	length: number;
	enum?: TEnum;
}

export type ClickHouseFixedStringBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	ClickHouseFixedStringBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'ClickHouseFixedString';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	}>;

export class ClickHouseFixedStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'ClickHouseFixedString'>>
	extends ClickHouseColumnBuilder<T, { length: number; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'ClickHouseFixedStringBuilder';

	constructor(name: T['name'], config: ClickHouseFixedStringConfig<T['enumValues']>) {
		super(name, 'string', 'ClickHouseFixedString');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseFixedString<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseFixedString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseFixedString<T extends ColumnBaseConfig<'string', 'ClickHouseFixedString'>>
	extends ClickHouseColumn<T, { length: number; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'ClickHouseFixedString';

	readonly length: number = this.config.length;

	override readonly enumValues = this.config.enumValues;

	getBaseSQLType(): string {
		return `FixedString(${this.length})`;
	}
}

/**
 * `FixedString(N)` — a fixed-width byte string. Values shorter than `N` are padded with null bytes
 * on write; values longer than `N` are rejected by ClickHouse.
 */
export function fixedString<U extends string, T extends Readonly<[U, ...U[]]>>(
	config: ClickHouseFixedStringConfig<T | Writable<T>>,
): ClickHouseFixedStringBuilderInitial<'', Writable<T>>;
export function fixedString<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: ClickHouseFixedStringConfig<T | Writable<T>>,
): ClickHouseFixedStringBuilderInitial<TName, Writable<T>>;
export function fixedString(a: string | ClickHouseFixedStringConfig, b?: ClickHouseFixedStringConfig): any {
	const { name, config } = getColumnNameAndConfig<ClickHouseFixedStringConfig>(a, b);
	return new ClickHouseFixedStringBuilder(name, config as any);
}
