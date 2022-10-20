import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgNumericBuilder extends PgColumnBuilder<ColumnBuilderConfig<{ data: string; driverParam: string }>> {
	/** @internal */ precision: number | undefined;
	/** @internal */ scale: number | undefined;

	constructor(name: string, precision?: number, scale?: number) {
		super(name);
		this.precision = precision;
		this.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgNumeric<TTableName> {
		return new PgNumeric(table, this);
	}
}

export class PgNumeric<TTableName extends string> extends PgColumn<
	ColumnConfig<{ tableName: TTableName; data: string; driverParam: string }>
> {
	protected override $pgColumnBrand!: 'PgNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgNumericBuilder) {
		super(table, builder);
		this.precision = builder.precision;
		this.scale = builder.scale;
	}

	getSQLType(): string {
		if (typeof this.precision !== 'undefined' && typeof this.scale !== 'undefined') {
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (typeof this.precision === 'undefined') {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export function numeric(
	name: string,
	config?:
		| { precision: number; scale?: number }
		| { precision?: number; scale: number }
		| { precision: number; scale: number },
): PgNumericBuilder {
	return new PgNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
