import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { Assume } from '~/utils';
import type { AnySQLiteTable } from '../table';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export interface SQLiteRealBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteRealBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteRealHKT;
}

export interface SQLiteRealHKT extends ColumnHKTBase {
	_type: SQLiteReal<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteRealBuilderInitial<TName extends string> = SQLiteRealBuilder<{
	name: TName;
	data: number;
	driverParam: number;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteRealBuilder<T extends ColumnBuilderBaseConfig> extends SQLiteColumnBuilder<SQLiteRealBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteReal<MakeColumnConfig<T, TTableName>> {
		return new SQLiteReal<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class SQLiteReal<T extends ColumnBaseConfig> extends SQLiteColumn<SQLiteRealHKT, T> {
	getSQLType(): string {
		return 'real';
	}
}

export function real<TName extends string>(name: TName): SQLiteRealBuilderInitial<TName> {
	return new SQLiteRealBuilder(name);
}
