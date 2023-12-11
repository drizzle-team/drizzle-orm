import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlJsonBuilderInitial<TName extends string> = MySqlJsonBuilder<
	{
		name: TName;
		dataType: 'json';
		columnType: 'MySqlJson';
		data: unknown;
		driverParam: string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'MySqlJson'>> extends MySqlColumnBuilder<T> {
	static readonly [entityKind]: string = 'MySqlJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'MySqlJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlJson<MakeColumnConfig<T, TTableName>> {
		return new MySqlJson<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlJson<T extends ColumnBaseConfig<'json', 'MySqlJson'>> extends MySqlColumn<T> {
	static readonly [entityKind]: string = 'MySqlJson';

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function json<TName extends string>(name: TName): MySqlJsonBuilderInitial<TName> {
	return new MySqlJsonBuilder(name);
}
