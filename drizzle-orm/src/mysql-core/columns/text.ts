import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume, type Writable } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export type MySqlTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export interface MySqlTextBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlTextBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: MySqlTextHKT;
}

export interface MySqlTextHKT extends ColumnHKTBase {
	_type: MySqlText<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

export type MySqlTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MySqlTextBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlTextBuilder<T extends ColumnBuilderBaseConfig & WithEnum> extends MySqlColumnBuilder<
	MySqlTextBuilderHKT,
	T,
	{ textType: MySqlTextColumnType; enumValues: T['enumValues'] | undefined }
> {
	static readonly [entityKind]: string = 'MySqlTextBuilder';

	constructor(name: T['name'], textType: MySqlTextColumnType, config: MySqlTextConfig<T['enumValues']>) {
		super(name);
		this.config.textType = textType;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlText<MakeColumnConfig<T, TTableName> & Pick<T, 'enumValues'>> {
		return new MySqlText<MakeColumnConfig<T, TTableName> & Pick<T, 'enumValues'>>(table, this.config);
	}
}

export class MySqlText<T extends ColumnBaseConfig & WithEnum>
	extends MySqlColumn<MySqlTextHKT, T, { textType: MySqlTextColumnType; enumValues: T['enumValues'] | undefined }>
	implements WithEnum<T['enumValues']>
{
	static readonly [entityKind]: string = 'MySqlText';

	private textType: MySqlTextColumnType = this.config.textType;
	readonly enumValues: T['enumValues'] = (this.config.enumValues ?? []) as T['enumValues'];

	getSQLType(): string {
		return this.textType;
	}
}

export interface MySqlTextConfig<TEnum extends readonly string[] | string[]> {
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlTextConfig<T | Writable<T>> = {},
): MySqlTextBuilderInitial<TName, Writable<T>> {
	return new MySqlTextBuilder(name, 'text', config);
}

export function tinytext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlTextConfig<T | Writable<T>> = {},
): MySqlTextBuilderInitial<TName, Writable<T>> {
	return new MySqlTextBuilder(name, 'tinytext', config);
}

export function mediumtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlTextConfig<T | Writable<T>> = {},
): MySqlTextBuilderInitial<TName, Writable<T>> {
	return new MySqlTextBuilder(name, 'mediumtext', config);
}

export function longtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlTextConfig<T | Writable<T>> = {},
): MySqlTextBuilderInitial<TName, Writable<T>> {
	return new MySqlTextBuilder(name, 'longtext', config);
}
