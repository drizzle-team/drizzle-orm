import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';
import { PgColumnBuilder, PgColumnWithMapper } from './common';

const isPgEnumSym = Symbol('isPgEnum');
export interface PgEnum<TValues extends string> {
	readonly enumName: string;
	readonly enumValues: TValues[];
	/** @internal */
	[isPgEnumSym]: true;
}

export function isPgEnum(obj: unknown): obj is PgEnum<string> {
	return !!obj && typeof obj === 'function' && isPgEnumSym in obj;
}

export class PgEnumColumnBuilder<
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
		table: AnyPgTable<TTableName>,
	): PgEnumColumn<TTableName, TData, TNotNull, THasDefault> {
		return new PgEnumColumn(table, this, this.enumName);
	}
}

export class PgEnumColumn<
	TTableName extends TableName,
	TData extends ColumnData<string>,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumnWithMapper<TTableName, TData, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgEnumColumn';

	constructor(
		table: AnyPgTable<TTableName>,
		builder: PgEnumColumnBuilder<TData, TNotNull, THasDefault>,
		public readonly enumName: string,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return this.enumName;
	}
}

export function pgEnum<T extends string = string>(enumName: string, values: T[]) {
	const enumValue: PgEnum<T> = {
		enumName,
		enumValues: values,
		[isPgEnumSym]: true,
	};
	const columnFactory = (name: string) => new PgEnumColumnBuilder<ColumnData<T>>(name, enumName, values);

	return Object.assign(columnFactory, enumValue);
}
