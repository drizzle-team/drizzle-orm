import { sql } from 'drizzle-orm';
import { ColumnData, ColumnHasDefault, ColumnNotNull, TableName, Unwrap } from 'drizzle-orm/branded-types';

import { MySqlColumnDriverParam } from '~/branded-types';
import { AnyMySQL } from '~/sql';
import { AnyMySqlTable } from '..';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export abstract class MySqlDateColumnBaseBuilder<
	TData extends ColumnData,
	TDriverParam extends MySqlColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	hasOnUpdateNow: boolean = false;

	override notNull(): MySqlDateColumnBaseBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.notNull() as ReturnType<this['notNull']>;
	}

	override default(
		value: Unwrap<TData> | AnyMySQL,
	): MySqlDateColumnBaseBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		return super.default(value) as ReturnType<this['default']>;
	}

	override primaryKey(): MySqlDateColumnBaseBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.primaryKey() as ReturnType<this['primaryKey']>;
	}

	defaultNow() {
		return this.default(sql`now()`);
	}

	onUpdateNow(): MySqlDateColumnBaseBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		this.hasOnUpdateNow = true;
		return this as ReturnType<this['onUpdateNow']>;
	}
}

export abstract class MySqlDateBaseColumn<
	TTableName extends TableName,
	TData extends ColumnData,
	TDriverParam extends MySqlColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault> {
	public readonly hasOnUpdateNow: boolean;

	constructor(
		table: AnyMySqlTable<TTableName>,
		builder: MySqlDateColumnBaseBuilder<TData, TDriverParam, TNotNull, THasDefault>,
	) {
		super(table, builder);
		this.hasOnUpdateNow = builder.hasOnUpdateNow;
	}
}
