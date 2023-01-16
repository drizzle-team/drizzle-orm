import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgDoublePrecisionBuilder extends PgColumnBuilder<
	ColumnBuilderConfig<{
		data: number;
		driverParam: string | number;
	}>
> {
	protected override $pgColumnBuilderBrand!: 'PgDoublePrecisionBuilder';

	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgDoublePrecision<TTableName> {
		return new PgDoublePrecision(table, this.config);
	}
}

export class PgDoublePrecision<TTableName extends string> extends PgColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: number;
		driverParam: string | number;
	}>
> {
	protected override $pgColumnBrand!: 'PgDoublePrecision';

	constructor(
		table: AnyPgTable<{ name: TTableName }>,
		config: PgDoublePrecisionBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return 'double precision';
	}

	override mapFromDriverValue(value: string | number): number {
		if (typeof value === 'string') {
			return parseFloat(value);
		}
		return value;
	}
}

export function doublePrecision(name: string) {
	return new PgDoublePrecisionBuilder(name);
}
