import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import type { Assume, Writable } from '~/utils';

import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export interface SQLiteTextBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteTextBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: SQLiteTextHKT;
}

export interface SQLiteTextHKT extends ColumnHKTBase {
	_type: SQLiteText<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

export type SQLiteTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = SQLiteTextBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteTextBuilder<T extends ColumnBuilderBaseConfig & WithEnum> extends SQLiteColumnBuilder<
	SQLiteTextBuilderHKT,
	T,
	{ length: number | undefined } & WithEnum<T['enumValues']>
> {
	constructor(name: T['name'], config: SQLiteTextConfig<T['enumValues']>) {
		super(name);
		this.config.enumValues = (config.enum ?? []) as T['enumValues'];
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteText<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>> {
		return new SQLiteText<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>>(table, this.config);
	}
}

export class SQLiteText<T extends ColumnBaseConfig & WithEnum>
	extends SQLiteColumn<SQLiteTextHKT, T, { length: number | undefined } & WithEnum<T['enumValues']>>
	implements WithEnum<T['enumValues']>
{
	readonly enumValues = this.config.enumValues;
	readonly length: number | undefined = this.config.length;

	constructor(
		table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteTextBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `text${this.config.length ? `(${this.config.length})` : ''}`;
	}
}

export interface SQLiteTextConfig<TEnum extends readonly string[] | string[]> {
	length?: number;
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SQLiteTextConfig<T | Writable<T>> = {},
): SQLiteTextBuilderInitial<TName, Writable<T>> {
	return new SQLiteTextBuilder(name, config);
}
