import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume, Writable } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlCharBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlCharBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: MySqlCharHKT;
}

export interface MySqlCharHKT extends ColumnHKTBase {
	_type: MySqlChar<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

export type MySqlCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MySqlCharBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlCharBuilder<T extends ColumnBuilderBaseConfig & WithEnum> extends MySqlColumnBuilder<
	MySqlCharBuilderHKT,
	T,
	MySqlCharConfig<T['enumValues']>
> {
	constructor(name: T['name'], config: MySqlCharConfig<T['enumValues']>) {
		super(name);
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlChar<MakeColumnConfig<T, TTableName> & Pick<T, 'enumValues'>> {
		return new MySqlChar<MakeColumnConfig<T, TTableName> & Pick<T, 'enumValues'>>(table, this.config);
	}
}

export class MySqlChar<T extends ColumnBaseConfig & WithEnum>
	extends MySqlColumn<MySqlCharHKT, T, MySqlCharConfig<T['enumValues']>>
	implements WithEnum<T['enumValues']>
{
	readonly length: number | undefined = this.config.length;
	readonly enumValues: T['enumValues'] = (this.config.enum ?? []) as T['enumValues'];

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface MySqlCharConfig<TEnum extends readonly string[] | string[]> {
	length?: number;
	enum?: TEnum;
}

export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlCharConfig<T | Writable<T>> = {},
): MySqlCharBuilderInitial<TName, Writable<T>> {
	return new MySqlCharBuilder(name, config);
}
