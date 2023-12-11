import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlYearBuilderInitial<TName extends string> = MySqlYearBuilder<
	{
		name: TName;
		dataType: 'number';
		columnType: 'MySqlYear';
		data: number;
		driverParam: number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlYearBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlYear'>> extends MySqlColumnBuilder<T> {
	static readonly [entityKind]: string = 'MySqlYearBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MySqlYear');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlYear<MakeColumnConfig<T, TTableName>> {
		return new MySqlYear<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlYear<
	T extends ColumnBaseConfig<'number', 'MySqlYear'>,
> extends MySqlColumn<T> {
	static readonly [entityKind]: string = 'MySqlYear';

	getSQLType(): string {
		return `year`;
	}
}

export function year<TName extends string>(name: TName): MySqlYearBuilderInitial<TName> {
	return new MySqlYearBuilder(name);
}
