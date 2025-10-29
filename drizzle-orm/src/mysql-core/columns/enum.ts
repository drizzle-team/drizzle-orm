import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import type { NonArray, Writable } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

// enum as string union
export type MySqlEnumColumnBuilderInitial<TName extends string, TEnum extends string[]> = MySqlEnumColumnBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlEnumColumn';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
}>;

export class MySqlEnumColumnBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlEnumColumn'>>
	extends MySqlColumnBuilder<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'MySqlEnumColumnBuilder';

	constructor(name: T['name'], values: T['enumValues']) {
		super(name, 'string', 'MySqlEnumColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MySqlEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlEnumColumn<T extends ColumnBaseConfig<'string', 'MySqlEnumColumn'>>
	extends MySqlColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'MySqlEnumColumn';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues!.map((value) => `'${value}'`).join(',')})`;
	}
}

// enum as ts enum

export type MySqlEnumObjectColumnBuilderInitial<TName extends string, TEnum extends object> =
	MySqlEnumObjectColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'MySqlEnumObjectColumn';
		data: TEnum[keyof TEnum];
		driverParam: string;
		enumValues: string[];
	}>;

export class MySqlEnumObjectColumnBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlEnumObjectColumn'>>
	extends MySqlColumnBuilder<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'MySqlEnumObjectColumnBuilder';

	constructor(name: T['name'], values: T['enumValues']) {
		super(name, 'string', 'MySqlEnumObjectColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlEnumObjectColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MySqlEnumObjectColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlEnumObjectColumn<T extends ColumnBaseConfig<'string', 'MySqlEnumObjectColumn'>>
	extends MySqlColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'MySqlEnumObjectColumn';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues!.map((value) => `'${value}'`).join(',')})`;
	}
}

export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	values: T | Writable<T>,
): MySqlEnumColumnBuilderInitial<'', Writable<T>>;
export function mysqlEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	values: T | Writable<T>,
): MySqlEnumColumnBuilderInitial<TName, Writable<T>>;
export function mysqlEnum<E extends Record<string, string>>(
	enumObj: NonArray<E>,
): MySqlEnumObjectColumnBuilderInitial<'', E>;
export function mysqlEnum<TName extends string, E extends Record<string, string>>(
	name: TName,
	values: NonArray<E>,
): MySqlEnumObjectColumnBuilderInitial<TName, E>;
export function mysqlEnum(
	a?: string | readonly [string, ...string[]] | [string, ...string[]] | Record<string, string>,
	b?: readonly [string, ...string[]] | [string, ...string[]] | Record<string, string>,
): any {
	// if name + array or just array - it means we have string union passed
	if (typeof a === 'string' && Array.isArray(b) || Array.isArray(a)) {
		const name = typeof a === 'string' && a.length > 0 ? a : '';
		const values = (typeof a === 'string' ? b : a) ?? [];

		if (values.length === 0) {
			throw new Error(`You have an empty array for "${name}" enum values`);
		}

		return new MySqlEnumColumnBuilder(name, values as any);
	}

	if (typeof a === 'string' && typeof b === 'object' || typeof a === 'object') {
		const name = typeof a === 'object' ? '' : a;
		const values = typeof a === 'object' ? Object.values(a) : typeof b === 'object' ? Object.values(b) : [];

		if (values.length === 0) {
			throw new Error(`You have an empty array for "${name}" enum values`);
		}

		return new MySqlEnumObjectColumnBuilder(name, values as any);
	}
}
