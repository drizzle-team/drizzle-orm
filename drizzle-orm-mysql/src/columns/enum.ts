import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlEnumBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends boolean = false,
	THasDefault extends boolean = false,
> extends MySqlColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */ values: string[];

	constructor(name: string, values: string[]) {
		super(name);
		this.values = values;
	}
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<TTableName>,
	): MySqlEnumColumn<TTableName, TData, TNotNull, THasDefault> {
		return new MySqlEnumColumn(table, this, this.values);
	}
}

export class MySqlEnumColumn<
	TTableName extends string,
	TData extends ColumnData<string>,
	TNotNull extends boolean,
	THasDefault extends boolean,
> extends MySqlColumn<TTableName, TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'MySqlEnumColumn';

	values: string[];

	constructor(
		table: AnyMySqlTable<TTableName>,
		builder: MySqlEnumBuilder<TData, TNotNull, THasDefault>,
		values: string[],
	) {
		super(table, builder);
		this.values = values;
	}

	getSQLType(): string {
		return `(${this.values.map((it) => `'${it}'`).join(',')})`;
	}
}

export interface MySqlEnumConfig<T extends string = string> {
	values: T[];
}

export function mysqlEnum<T extends string = string>(
	name: string,
	config: MySqlEnumConfig<T>,
): MySqlEnumBuilder<ColumnData<T>> {
	return new MySqlEnumBuilder(name, config.values);
}
