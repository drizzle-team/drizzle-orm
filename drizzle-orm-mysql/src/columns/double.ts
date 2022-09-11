import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlDoubleBuilder<
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
	): MySqlDouble<TTableName, TNotNull, THasDefault> {
		return new MySqlDouble<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlDouble<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumn<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlDouble';

	precision: number | undefined;
	scale: number | undefined;

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlDoubleBuilder<TNotNull, THasDefault>) {
		super(table, builder);
		this.precision = builder.precision;
		this.scale = builder.scale;
	}

	getSQLType(): string {
		return 'double';
		// if (typeof this.precision !== 'undefined' && typeof this.scale !== 'undefined') {
		// 	return `double(${this.precision}, ${this.scale})`;
		// } else if (typeof this.precision === 'undefined') {
		// 	return 'double';
		// } else {
		// 	return `double(${this.precision})`;
		// }
	}
}

export interface MySqlDoubleConfig {
	precision?: number;
	scale?: number;
}

export function double(name: string, config?: MySqlDoubleConfig): MySqlDoubleBuilder {
	return new MySqlDoubleBuilder(name, config?.precision, config?.scale);
}
