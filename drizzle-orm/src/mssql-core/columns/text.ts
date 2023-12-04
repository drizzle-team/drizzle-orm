import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export type MsSqlTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MsSqlTextBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlText';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
}>;

export class MsSqlTextBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlText'>> extends MsSqlColumnBuilder<
	T,
	{ textType: MsSqlTextColumnType; enumValues: T['enumValues'] }
> {
	static readonly [entityKind]: string = 'MsSqlTextBuilder';

	constructor(name: T['name'], textType: MsSqlTextColumnType, config: MsSqlTextConfig<T['enumValues']>) {
		super(name, 'string', 'MsSqlText');
		this.config.textType = textType;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlText<MakeColumnConfig<T, TTableName>> {
		return new MsSqlText<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlText<T extends ColumnBaseConfig<'string', 'MsSqlText'>>
	extends MsSqlColumn<T, { textType: MsSqlTextColumnType; enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'MsSqlText';

	private textType: MsSqlTextColumnType = this.config.textType;

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.textType;
	}
}

export interface MsSqlTextConfig<TEnum extends readonly string[] | string[] | undefined> {
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MsSqlTextConfig<T | Writable<T>> = {},
): MsSqlTextBuilderInitial<TName, Writable<T>> {
	return new MsSqlTextBuilder(name, 'text', config);
}

export function tinytext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MsSqlTextConfig<T | Writable<T>> = {},
): MsSqlTextBuilderInitial<TName, Writable<T>> {
	return new MsSqlTextBuilder(name, 'tinytext', config);
}

export function mediumtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MsSqlTextConfig<T | Writable<T>> = {},
): MsSqlTextBuilderInitial<TName, Writable<T>> {
	return new MsSqlTextBuilder(name, 'mediumtext', config);
}

export function longtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MsSqlTextConfig<T | Writable<T>> = {},
): MsSqlTextBuilderInitial<TName, Writable<T>> {
	return new MsSqlTextBuilder(name, 'longtext', config);
}
