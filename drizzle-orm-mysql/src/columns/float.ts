import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export class MySqlFloatBuilder extends MySqlColumnBuilderWithAutoIncrement<
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
	): MySqlFloat<TTableName> {
		return new MySqlFloat(table, this);
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

	constructor(table: AnyMySqlTable<{ name: TTableName }>, builder: MySqlFloatBuilder) {
		super(table, builder);
		this.precision = builder.precision;
		this.scale = builder.scale;
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
