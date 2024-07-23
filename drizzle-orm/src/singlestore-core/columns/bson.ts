import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlBsonBuilderInitial<TName extends string> = MySqlBsonBuilder<{
	name: TName;
	dataType: 'json'; // The bson is stored as a json string the same way binary is stored as a string (check `./binary.ts`)
	columnType: 'MySqlBson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class MySqlBsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'MySqlBson'>> extends MySqlColumnBuilder<T> {
	static readonly [entityKind]: string = 'MySqlBsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'MySqlBson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBson<MakeColumnConfig<T, TTableName>> {
		return new MySqlBson<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlBson<T extends ColumnBaseConfig<'json', 'MySqlBson'>> extends MySqlColumn<T> {
	static readonly [entityKind]: string = 'MySqlBson';

	getSQLType(): string {
		return 'bson';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function bson<TName extends string>(name: TName): MySqlBsonBuilderInitial<TName> {
	return new MySqlBsonBuilder(name);
}
