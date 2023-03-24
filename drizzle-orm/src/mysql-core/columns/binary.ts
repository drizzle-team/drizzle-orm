import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlBinaryBuilder<TData extends string = string> extends MySqlColumnBuilder<
	ColumnBuilderConfig<{
		data: TData;
		driverParam: number | string;
	}>,
	{ length: number | undefined }
> {
	constructor(name: string, length?: number) {
		super(name);
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBinary<TTableName, TData> {
		return new MySqlBinary(table, this.config);
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

	constructor(table: AnyMySqlTable<{ name: TTableName }>, config: MySqlBinaryBuilder<TData>['config']) {
		super(table, config);
		this.length = config.length;
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
