import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlVarBinaryBuilder extends MySqlColumnBuilder<
	ColumnBuilderConfig<{
		data: number;
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
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlVarBinary<TTableName> {
		return new MySqlVarBinary(table, this.config);
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

	constructor(table: AnyMySqlTable<{ name: TTableName }>, config: MySqlVarBinaryBuilder['config']) {
		super(table, config);
		this.length = config.length;
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
