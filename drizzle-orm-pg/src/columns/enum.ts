import { AnyTable } from 'drizzle-orm';
import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { PgColumn, PgColumnBuilder } from './common';

export class PgEnum<TValues extends string> {
	constructor(
		public readonly enumName: string,
		public readonly enumValues: TValues[],
	) {}
}

export class PgEnumBuilder<
	TData extends ColumnData<string> = ColumnData<string>,
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	/** @internal */ values: string[];
	/** @internal */ enumName: string;

	constructor(name: string, enumName: string, values: string[]) {
		super(name);
		this.enumName = enumName;
		this.values = values;
	}
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyTable<TTableName>,
	): PgEnumColumn<TTableName, TData, TNotNull, THasDefault> {
		return new PgEnumColumn(table, this, this.enumName);
	}
}

export class PgEnumColumn<
	TTableName extends TableName,
	TData extends ColumnData<string>,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgEnumColumn';

	constructor(
		table: AnyTable<TTableName>,
		builder: PgEnumBuilder<TData, TNotNull, THasDefault>,
		public readonly enumName: string,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return this.enumName;
	}
}

export function pgEnum<T extends string = string>(enumName: string, values: T[]) {
	const result = new PgEnum(enumName, values);
	const columnFactory = (name: string) => new PgEnumBuilder<ColumnData<T>>(name, enumName, values);

	return Object.assign(result, columnFactory);
}
