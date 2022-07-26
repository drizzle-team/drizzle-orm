import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlRealBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<string>, ColumnDriverParam<string>, TNotNull, THasDefault> {
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
	): MySqlReal<TTableName, TNotNull, THasDefault> {
		return new MySqlReal<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlReal<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithMapper<
	TTableName,
	ColumnData<string>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlReal';

	precision: number | undefined;
	scale: number | undefined;

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlRealBuilder<TNotNull, THasDefault>) {
		super(table, builder);
		this.precision = builder.precision;
		this.scale = builder.scale;
	}

	getSQLType(): string {
		if (typeof this.precision !== 'undefined' && typeof this.scale !== 'undefined') {
			return `real(${this.precision}, ${this.scale})`;
		} else if (typeof this.precision === 'undefined') {
			return 'real';
		} else {
			return `real(${this.precision})`;
		}
	}
}

export function real(name: string, precision?: number, scale?: number) {
	return new MySqlRealBuilder(name, precision, scale);
}
