import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable } from '~/sqlite-core/table.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export type SQLiteNumericBuilderInitial<TName extends string> = SQLiteNumericBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'SQLiteNumeric';
		data: string;
		driverParam: string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class SQLiteNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'SQLiteNumeric'>>
	extends SQLiteColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SQLiteNumericBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'SQLiteNumeric');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteNumeric<MakeColumnConfig<T, TTableName>> {
		return new SQLiteNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteNumeric<T extends ColumnBaseConfig<'string', 'SQLiteNumeric'>> extends SQLiteColumn<T> {
	static readonly [entityKind]: string = 'SQLiteNumeric';

	getSQLType(): string {
		return 'numeric';
	}
}

export function numeric<TName extends string>(name: TName): SQLiteNumericBuilderInitial<TName> {
	return new SQLiteNumericBuilder(name);
}
