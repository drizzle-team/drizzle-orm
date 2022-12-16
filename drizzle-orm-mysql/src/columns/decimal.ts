import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlDecimalBuilder extends MySqlColumnBuilderWithAutoIncrement<
	ColumnBuilderConfig<{
		data: number;
		driverParam: number | string;
	}>
> {
	/** @internal */ precision: number | undefined;
	/** @internal */ scale: number | undefined;

	constructor(name: string, precision?: number, scale?: number) {
		super(name);
		this.precision = precision;
		this.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDecimal<TTableName> {
		return new MySqlDecimal(table, this);
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

	precision: number | undefined;
	scale: number | undefined;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, builder: MySqlDecimalBuilder) {
		super(table, builder);
		this.precision = builder.precision;
		this.scale = builder.scale;
	}

	getSQLType(): string {
		if (typeof this.precision !== 'undefined' && typeof this.scale !== 'undefined') {
			return `decimal(${this.precision}, ${this.scale})`;
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
