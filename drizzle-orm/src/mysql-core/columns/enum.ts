import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume, type Writable } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlEnumColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlEnumColumnBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: MySqlEnumColumnHKT;
}

export interface MySqlEnumColumnHKT extends ColumnHKTBase {
	_type: MySqlEnumColumn<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

export type MySqlEnumColumnBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	MySqlEnumColumnBuilder<{
		name: TName;
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
		notNull: false;
		hasDefault: false;
	}>;

export class MySqlEnumColumnBuilder<T extends ColumnBuilderBaseConfig & WithEnum>
	extends MySqlColumnBuilder<MySqlEnumColumnBuilderHKT, T, Pick<T, 'enumValues'>>
{
	static readonly [entityKind]: string = 'MySqlEnumColumnBuilder';

	constructor(name: T['name'], values: T['enumValues']) {
		super(name);
		this.config.enumValues = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlEnumColumn<MakeColumnConfig<T, TTableName> & Pick<T, 'enumValues'>> {
		return new MySqlEnumColumn<MakeColumnConfig<T, TTableName> & Pick<T, 'enumValues'>>(
			table,
			this.config,
		);
	}
}

export class MySqlEnumColumn<T extends ColumnBaseConfig & WithEnum>
	extends MySqlColumn<MySqlEnumColumnHKT, T, Pick<T, 'enumValues'>>
	implements WithEnum<T['enumValues']>
{
	static readonly [entityKind]: string = 'MySqlEnumColumn';

	readonly enumValues: T['enumValues'] = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues.map((value) => `'${value}'`).join(',')})`;
	}
}

export function mysqlEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	values: T | Writable<T>,
): MySqlEnumColumnBuilderInitial<TName, Writable<T>> {
	if (values.length === 0) {
		throw new Error(`You have an empty array for "${name}" enum values`);
	}

	return new MySqlEnumColumnBuilder(name, values);
}
