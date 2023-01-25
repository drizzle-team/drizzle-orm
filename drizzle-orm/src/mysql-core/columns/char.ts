import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlCharBuilder<TData extends string = string> extends MySqlColumnBuilder<
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
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlChar<TTableName, TData> {
		return new MySqlChar(table, this.config);
	}
}

export class MySqlChar<
	TTableName extends string,
	TData extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: TData;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlChar';

	length: number | undefined;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, config: MySqlCharBuilder<TData>['config']) {
		super(table, config);
		this.length = config.length;
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
