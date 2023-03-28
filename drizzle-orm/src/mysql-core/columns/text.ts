import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume, Writable } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export type MySqlTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export interface MySqlTextBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlTextBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlTextHKT;
}

export interface MySqlTextHKT extends ColumnHKTBase {
	_type: MySqlText<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlTextBuilderInitial<TName extends string, TEnum extends string[]> = MySqlTextBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: string;
	enum: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlTextBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<
	MySqlTextBuilderHKT,
	T,
	{ textType: MySqlTextColumnType; enum: string[] }
> {
	constructor(name: T['name'], textType: MySqlTextColumnType, config: MySqlTextConfig<string[]>) {
		super(name);
		this.config.textType = textType;
		this.config.enum = config.enum ?? [];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlText<MakeColumnConfig<T, TTableName>> {
		return new MySqlText<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlText<T extends ColumnBaseConfig>
	extends MySqlColumn<MySqlTextHKT, T, { textType: MySqlTextColumnType; enum: string[] }>
{
	private textType: MySqlTextColumnType = this.config.textType;
	readonly enum: string[] = this.config.enum;

	getSQLType(): string {
		return this.textType;
	}
}

export interface MySqlTextConfig<TEnum extends string[]> {
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlTextConfig<Writable<T>> = {},
): MySqlTextBuilderInitial<TName, Writable<T>> {
	return new MySqlTextBuilder(name, 'text', config);
}

export function tinytext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlTextConfig<Writable<T>> = {},
): MySqlTextBuilderInitial<TName, Writable<T>> {
	return new MySqlTextBuilder(name, 'tinytext', config);
}

export function mediumtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlTextConfig<Writable<T>> = {},
): MySqlTextBuilderInitial<TName, Writable<T>> {
	return new MySqlTextBuilder(name, 'mediumtext', config);
}

export function longtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlTextConfig<Writable<T>> = {},
): MySqlTextBuilderInitial<TName, Writable<T>> {
	return new MySqlTextBuilder(name, 'longtext', config);
}
