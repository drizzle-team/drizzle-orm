import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlCharBuilder<TData extends string = string> extends MySqlColumnBuilder<
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
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlChar<TTableName, TData> {
		return new MySqlChar(table, this);
	}
}

export class MySqlChar<
	TTableName extends string,
	TData extends string
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: TData;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlChar';

	length: number | undefined;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, builder: MySqlCharBuilder<TData>) {
		super(table, builder);
		this.length = builder.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `char(${this.length})` : `char`;
	}
}

export interface MySqlCharConfig {
	length?: number;
}

export function char(name: string, config: MySqlCharConfig = {}): MySqlCharBuilder {
	return new MySqlCharBuilder(name, config.length);
}
