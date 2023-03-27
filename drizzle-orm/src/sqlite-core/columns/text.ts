import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import type { Assume, Writable } from '~/utils';

import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export interface SQLiteTextBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteTextBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteTextHKT;
}

export interface SQLiteTextHKT extends ColumnHKTBase {
	_type: SQLiteText<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteTextBuilderInitial<TName extends string, TEnum extends string[]> = SQLiteTextBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: string;
	enum: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteTextBuilder<T extends ColumnBuilderBaseConfig> extends SQLiteColumnBuilder<
	SQLiteTextBuilderHKT,
	T,
	{ enum: string[] }
> {
	constructor(name: T['name'], config: SQLiteTextConfig<string[]>) {
		super(name);
		this.config.enum = config.enum ?? [];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteText<MakeColumnConfig<T, TTableName>> {
		return new SQLiteText<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class SQLiteText<T extends ColumnBaseConfig> extends SQLiteColumn<SQLiteTextHKT, T> {
	readonly enum: string[];

	constructor(
		table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteTextBuilder<T>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return 'text';
	}
}

export interface SQLiteTextConfig<TEnum extends string[]> {
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SQLiteTextConfig<Writable<T>> = {},
): SQLiteTextBuilderInitial<TName, Writable<T>> {
	return new SQLiteTextBuilder(name, config);
}
