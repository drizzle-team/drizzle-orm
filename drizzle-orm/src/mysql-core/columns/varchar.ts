import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlVarCharBuilder<
	TData extends string = string,
> extends MySqlColumnBuilder<
	ColumnBuilderConfig<{
		data: TData;
		driverParam: number | string;
	}>,
	{ length: number | undefined }
> {
	/** @internal */
	constructor(name: string, length?: number) {
		super(name);
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarChar<TTableName, TData> {
		return new MySqlVarChar(table, this.config);
	}
}

export class MySqlVarChar<
	TTableName extends string,
	TData extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: TData;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlVarChar';

	length: number | undefined;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, config: MySqlVarCharBuilder<TData>['config']) {
		super(table, config);
		this.length = config.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `varchar(${this.length})` : `varchar`;
	}
}

export interface MySqlVarcharOptions {
	length: number;
}

export function varchar(name: string, options: MySqlVarcharOptions): MySqlVarCharBuilder;
export function varchar<T extends string = string>(
	name: string,
	options: MySqlVarcharOptions,
): MySqlVarCharBuilder<T>;
export function varchar(name: string, options: MySqlVarcharOptions) {
	return new MySqlVarCharBuilder(name, options.length);
}
