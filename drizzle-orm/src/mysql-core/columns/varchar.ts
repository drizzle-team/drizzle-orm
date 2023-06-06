import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume, type Writable } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlVarCharBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlVarCharBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: MySqlVarCharHKT;
}

export interface MySqlVarCharHKT extends ColumnHKTBase {
	_type: MySqlVarChar<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

export type MySqlVarCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MySqlVarCharBuilder<
	{
		name: TName;
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		notNull: false;
		hasDefault: false;
	}
>;

export class MySqlVarCharBuilder<T extends ColumnBuilderBaseConfig & WithEnum>
	extends MySqlColumnBuilder<MySqlVarCharBuilderHKT, T, MySqlVarCharConfig<T['enumValues']>>
{
	static readonly [entityKind]: string = 'MySqlVarCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarCharConfig<T['enumValues']>) {
		super(name);
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarChar<MakeColumnConfig<T, TTableName> & Pick<T, 'enumValues'>> {
		return new MySqlVarChar<MakeColumnConfig<T, TTableName> & Pick<T, 'enumValues'>>(table, this.config);
	}
}

export class MySqlVarChar<T extends ColumnBaseConfig & WithEnum>
	extends MySqlColumn<MySqlVarCharHKT, T, MySqlVarCharConfig<T['enumValues']>>
	implements WithEnum
{
	static readonly [entityKind]: string = 'MySqlVarChar';

	readonly length: number | undefined = this.config.length;
	readonly enumValues: T['enumValues'] = (this.config.enum ?? []) as T['enumValues'];

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface MySqlVarCharConfig<TEnum extends string[] | readonly string[]> {
	length: number;
	enum?: TEnum;
}

export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlVarCharConfig<T | Writable<T>>,
): MySqlVarCharBuilderInitial<TName, Writable<T>> {
	return new MySqlVarCharBuilder(name, config);
}
