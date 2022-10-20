import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgRealBuilder extends PgColumnBuilder<
	ColumnBuilderConfig<{ data: number; driverParam: string | number }>
> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgReal<TTableName> {
		return new PgReal(table, this);
	}
}

export class PgReal<TTableName extends string> extends PgColumn<
	ColumnConfig<{ tableName: TTableName; data: number; driverParam: string | number }>
> {
	protected override $pgColumnBrand!: 'PgReal';

	constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgRealBuilder) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue = (value: string | number): number => {
		if (typeof value === 'string') {
			return parseFloat(value);
		}
		return value;
	};
}

export function real(name: string) {
	return new PgRealBuilder(name);
}
