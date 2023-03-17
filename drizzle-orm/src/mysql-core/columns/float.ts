import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn, MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlFloatBuilder extends MySqlColumnBuilderWithAutoIncrement<
	ColumnBuilderConfig<{
		data: number;
		driverParam: number | string;
	}>,
	{ precision: number | undefined; scale: number | undefined }
> {
	constructor(name: string, precision?: number, scale?: number) {
		super(name);
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlFloat<TTableName> {
		return new MySqlFloat(table, this.config);
	}
}

export class MySqlFloat<
	TTableName extends string,
> extends MySqlColumnWithAutoIncrement<
	ColumnConfig<{
		tableName: TTableName;
		data: number;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlFloat';

	precision: number | undefined;
	scale: number | undefined;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, config: MySqlFloatBuilder['config']) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	getSQLType(): string {
		return 'float';
		// if (typeof this.precision !== 'undefined' && typeof this.scale !== 'undefined') {
		// 	return `float(${this.precision}, ${this.scale})`;
		// } else if (typeof this.precision === 'undefined') {
		// 	return 'float';
		// } else {
		// 	return `float(${this.precision})`;
		// }
	}
}

export function float(name: string) {
	return new MySqlFloatBuilder(name);
}
