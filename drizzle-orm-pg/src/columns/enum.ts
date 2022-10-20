import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

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

export class PgEnumColumnBuilder<TData extends string = string>
	extends PgColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>>
{
	/** @internal */ values: string[];
	/** @internal */ enumName: string;

	constructor(name: string, enumName: string, values: string[]) {
		super(name);
		this.enumName = enumName;
		this.values = values;
	}
	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgEnumColumn<TTableName, TData> {
		return new PgEnumColumn(table, this, this.enumName);
	}
}

export class PgEnumColumn<TTableName extends string, TData extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgEnumColumn';

	constructor(
		table: AnyPgTable<{ name: TTableName }>,
		builder: PgEnumColumnBuilder<TData>,
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
	const columnFactory = (name: string) => new PgEnumColumnBuilder<T>(name, enumName, values);

	return Object.assign(columnFactory, enumValue);
}
