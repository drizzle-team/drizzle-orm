import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlDecimalBuilder<
	TNotNull extends boolean = false,
	THasDefault extends boolean = false,
> extends MySqlColumnBuilder<ColumnData<string>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */ precision: number | undefined;
	/** @internal */ scale: number | undefined;

	constructor(name: string, precision?: number, scale?: number) {
		super(name);
		this.precision = precision;
		this.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<TTableName>,
	): MySqlDecimal<TTableName, TNotNull, THasDefault> {
		return new MySqlDecimal<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlDecimal<
	TTableName extends string,
	TNotNull extends boolean,
	THasDefault extends boolean,
> extends MySqlColumn<
	TTableName,
	ColumnData<string>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlDecimal';

	precision: number | undefined;
	scale: number | undefined;

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlDecimalBuilder<TNotNull, THasDefault>) {
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
