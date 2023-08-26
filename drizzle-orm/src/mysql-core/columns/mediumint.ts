import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlMediumIntBuilderInitial<TName extends string> = MySqlMediumIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlMediumInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlMediumIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlMediumInt'>>
	extends MySqlColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlMediumIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MySqlMediumInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlMediumInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlMediumInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlMediumInt<T extends ColumnBaseConfig<'number', 'MySqlMediumInt'>>
	extends MySqlColumnWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlMediumInt';

	getSQLType(): string {
		return 'mediumint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function mediumint<TName extends string>(name: TName): MySqlMediumIntBuilderInitial<TName> {
	return new MySqlMediumIntBuilder(name);
}
