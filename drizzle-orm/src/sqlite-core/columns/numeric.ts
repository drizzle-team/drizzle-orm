import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import type { Assume } from '~/utils';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export interface SQLiteNumericBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteNumericBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteNumericHKT;
}

export interface SQLiteNumericHKT extends ColumnHKTBase {
	_type: SQLiteNumeric<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteNumericBuilderInitial<TName extends string> = SQLiteNumericBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteNumericBuilder<T extends ColumnBuilderBaseConfig>
	extends SQLiteColumnBuilder<SQLiteNumericBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteNumeric<MakeColumnConfig<T, TTableName>> {
		return new SQLiteNumeric<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class SQLiteNumeric<T extends ColumnBaseConfig> extends SQLiteColumn<SQLiteNumericHKT, T> {
	getSQLType(): string {
		return 'numeric';
	}
}

export function numeric<TName extends string>(name: TName): SQLiteNumericBuilderInitial<TName> {
	return new SQLiteNumericBuilder(name);
}
