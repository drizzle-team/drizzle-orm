import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlBooleanBuilderInitial<TName extends string> = MySqlBooleanBuilder<
	{
		name: TName;
		dataType: 'boolean';
		columnType: 'MySqlBoolean';
		data: boolean;
		driverParam: number | boolean;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'MySqlBoolean'>>
	extends MySqlColumnBuilder<T>
{
	static readonly [entityKind]: string = 'MySqlBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'MySqlBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBoolean<MakeColumnConfig<T, TTableName>> {
		return new MySqlBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlBoolean<T extends ColumnBaseConfig<'boolean', 'MySqlBoolean'>> extends MySqlColumn<T> {
	static readonly [entityKind]: string = 'MySqlBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: number | boolean): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	}
}

export function boolean<TName extends string>(name: TName): MySqlBooleanBuilderInitial<TName> {
	return new MySqlBooleanBuilder(name);
}
