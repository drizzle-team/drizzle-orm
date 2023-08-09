import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnySQLiteTable } from '../table';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export type SQLiteRealBuilderInitial<TName extends string> = SQLiteRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SQLiteReal';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class SQLiteRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'SQLiteReal'>>
	extends SQLiteColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SQLiteRealBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SQLiteReal');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteReal<MakeColumnConfig<T, TTableName>> {
		return new SQLiteReal<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SQLiteReal<T extends ColumnBaseConfig<'number', 'SQLiteReal'>> extends SQLiteColumn<T> {
	static readonly [entityKind]: string = 'SQLiteReal';

	getSQLType(): string {
		return 'real';
	}
}

export function real<TName extends string>(name: TName): SQLiteRealBuilderInitial<TName> {
	return new SQLiteRealBuilder(name);
}
