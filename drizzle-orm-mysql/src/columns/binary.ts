import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlBinaryBuilder<TData extends string = string> extends MySqlColumnBuilder<
	ColumnBuilderConfig<{
		data: TData;
		driverParam: number | string;
	}>
> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlBinary<TTableName, TData> {
		return new MySqlBinary(table, this);
	}
}

export class MySqlBinary<
	TTableName extends string,
	TData extends string = string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: TData;
		driverParam: number | string;
	}>
> {
	declare protected $mySqlColumnBrand: 'MySqlBinary';

	length: number | undefined;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, builder: MySqlBinaryBuilder<TData>) {
		super(table, builder);
		this.length = builder.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `binary(${this.length})` : `binary`;
	}
}

export interface MySqlBinaryConfig {
	length?: number;
}

export function binary(name: string, config: MySqlBinaryConfig = {}): MySqlBinaryBuilder {
	return new MySqlBinaryBuilder(name, config.length);
}
