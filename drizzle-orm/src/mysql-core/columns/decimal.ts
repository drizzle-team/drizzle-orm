import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn, MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlDecimalBuilder extends MySqlColumnBuilderWithAutoIncrement<
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
	): MySqlDecimal<TTableName> {
		return new MySqlDecimal(table, this.config);
	}
}

export class MySqlDecimal<TTableName extends string> extends MySqlColumnWithAutoIncrement<
	ColumnConfig<{
		tableName: TTableName;
		data: number;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlDecimal';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, config: MySqlDecimalBuilder['config']) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	getSQLType(): string {
		if (typeof this.precision !== 'undefined' && typeof this.scale !== 'undefined') {
			return `decimal(${this.precision},${this.scale})`;
		} else if (typeof this.precision === 'undefined') {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export interface MySqlDecimalConfig {
	precision?: number;
	scale?: number;
}

export function decimal(name: string, config: MySqlDecimalConfig = {}): MySqlDecimalBuilder {
	return new MySqlDecimalBuilder(name, config.precision, config.scale);
}
