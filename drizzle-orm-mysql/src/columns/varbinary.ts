import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlVarBinaryBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<string>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlVarBinary<TTableName, TNotNull, THasDefault> {
		return new MySqlVarBinary<TTableName, TNotNull, THasDefault>(table, this);
	}
}

export class MySqlVarBinary<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumn<
	TTableName,
	ColumnData<string>,
	ColumnDriverParam<string>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'MySqlVarBinary';

	length: number | undefined;

	constructor(table: AnyMySqlTable<TTableName>, builder: MySqlVarBinaryBuilder<TNotNull, THasDefault>) {
		super(table, builder);
		this.length = builder.length;
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
