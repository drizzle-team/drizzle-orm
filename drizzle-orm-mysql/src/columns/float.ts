import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlFloatBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<number>, ColumnDriverParam<number>, TNotNull, THasDefault> {
	/** @internal */ precision: number | undefined;
	/** @internal */ scale: number | undefined;

	constructor(name: string, precision?: number, scale?: number) {
		super(name);
		this.precision = precision;
		this.scale = scale;
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlFloat<TTableName, TNotNull, THasDefault> {
		return new MySqlFloat<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlFloat<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithMapper<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlFloat';

	precision: number | undefined;
	scale: number | undefined;

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlFloatBuilder<TNotNull, THasDefault>) {
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
