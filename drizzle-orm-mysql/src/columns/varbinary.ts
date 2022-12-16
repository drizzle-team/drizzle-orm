import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlVarBinaryBuilder extends MySqlColumnBuilder<
	ColumnBuilderConfig<{
		data: number;
		driverParam: number | string;
	}>
> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlVarBinary<TTableName> {
		return new MySqlVarBinary(table, this);
	}
}

export class MySqlVarBinary<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: number;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlVarBinary';

	length: number | undefined;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, builder: MySqlVarBinaryBuilder) {
		super(table, builder);
		this.length = builder.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `varbinary(${this.length})` : `varbinary`;
	}
}

export interface MySqlVarbinaryOptions {
	length: number;
}

export function varbinary(name: string, options: MySqlVarbinaryOptions) {
	return new MySqlVarBinaryBuilder(name, options.length);
}
