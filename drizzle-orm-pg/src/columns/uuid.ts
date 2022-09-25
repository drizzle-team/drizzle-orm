import { sql } from 'drizzle-orm';
import {
	ColumnData,
	ColumnDriverParam,
	ColumnHasDefault,
	ColumnNotNull,
	TableName,
} from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';

import { PgColumn, PgColumnBuilder } from './common';

export class PgUUIDBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/**
	 * Adds `default gen_random_uuid()` to the column definition.
	 */
	defaultRandom(): ReturnType<this['default']> {
		return this.default(sql`gen_random_uuid()`) as ReturnType<this['default']>;
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgUUID<TTableName, TNotNull, THasDefault, TData> {
		return new PgUUID(table, this);
	}
}

export class PgUUID<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
	TData extends ColumnData<string>,
> extends PgColumn<TTableName, TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgUUID';

	constructor(
		table: AnyPgTable<TTableName>,
		builder: PgUUIDBuilder<TData, TNotNull, THasDefault>,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid<T extends string = string>(name: string): PgUUIDBuilder<ColumnData<T>> {
	return new PgUUIDBuilder<ColumnData<T>>(name);
}
